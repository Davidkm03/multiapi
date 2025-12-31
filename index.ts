import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import { sambaNovaService } from './services/sambanova';
import { imageService } from './services/images';
import { isWorkflowRequest, generateWorkflow } from './services/workflow-generator';
import { dbManager } from './db';
import type { AIService, ChatMessage } from './types';

// Configuración
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

// Lista de servicios de TEXTO
const aiServices: AIService[] = [
    groqService,
    cerebrasService,
    geminiService,
    openRouterService,
    sambaNovaService,
];

let currentServiceIndex = 0;

function getNextService(): AIService {
    if (aiServices.length === 0) throw new Error("No AI services available");
    const service = aiServices[currentServiceIndex];
    currentServiceIndex = (currentServiceIndex + 1) % aiServices.length;
    // TypeScript check: service should exist given the length check, but fallback to index 0 just in case
    return service || aiServices[0];
}

console.log(`🚀 AI Proxy API running at http://localhost:${PORT}`);

Bun.serve({
    port: PORT,
    idleTimeout: 60, // Aumentamos timeout para generación de imágenes (Flux puede tardar >10s)
    async fetch(req) {
        const url = new URL(req.url);
        const { pathname } = url;

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret'
        };

        if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

        // --- STATIC ---
        if (req.method === 'GET') {
            if (pathname === '/') return new Response(Bun.file('public/index.html'));
            const publicFile = Bun.file(`public${pathname}`);
            if (await publicFile.exists()) return new Response(publicFile);
        }

        // --- CHAT API ---
        if (req.method === 'POST' && (pathname === '/chat' || pathname === '/api/chat')) {
            const authHeader = req.headers.get('Authorization');
            const apiKey = authHeader?.replace('Bearer ', '');

            if (!apiKey || !dbManager.validateAndTrack(apiKey)) {
                return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API Key' }), {
                    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            try {
                const body = await req.json() as { messages: ChatMessage[] };
                const messages = body.messages;
                if (!Array.isArray(messages)) return new Response('Invalid messages', { status: 400 });

                // SANITIZACIÓN ROBUSTA: Eliminamos Data URLs gigantes para no romper Groq/Cerebras (Error 413)
                // Esto asegura que aunque el frontend envíe la imagen completa, el backend la "adelgaza" antes de llamar a la IA.
                const sanitizedMessages = messages.map(m => ({
                    ...m,
                    content: m.content ? m.content.replace(/!\[.*?\]\(data:image\/.*?\)/g, '[Imagen Generada - Omitida por peso]') : ''
                }));

                // DETECTAR INTENCIÓN (Smart Routing)
                const lastMessage = sanitizedMessages[sanitizedMessages.length - 1];
                const content = lastMessage?.content?.trim() || '';
                const contentLower = content.toLowerCase();

                // 1. Check for Image Request
                const isImageReq =
                    contentLower.startsWith('/img') ||
                    contentLower.startsWith('dibuja') ||
                    contentLower.startsWith('crea una imagen') ||
                    contentLower.startsWith('genera una imagen') ||
                    contentLower.includes('generame una imagen');

                // 2. Check for Workflow/Automation Request
                const isWorkflowReq = isWorkflowRequest(content);

                let responseGenerator: AsyncGenerator<string>;

                if (isImageReq) {
                    console.log(`[Routing] Image request detected. Key: ${apiKey.slice(0, 8)}...`);
                    responseGenerator = imageService.chat(sanitizedMessages);
                } else if (isWorkflowReq) {
                    console.log(`[Routing] Workflow request detected. Key: ${apiKey.slice(0, 8)}...`);
                    responseGenerator = generateWorkflow(content);
                } else {
                    const service = getNextService();
                    console.log(`[Routing] Using ${service.name}. Key: ${apiKey.slice(0, 8)}...`);
                    responseGenerator = service.chat(sanitizedMessages);
                }

                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of responseGenerator) {
                                controller.enqueue(new TextEncoder().encode(chunk));
                            }
                            controller.close();
                        } catch (err) {
                            console.error(err);
                            controller.error(err);
                        }
                    },
                });

                // Determine service name for header
                const serviceName = isImageReq ? 'image' : isWorkflowReq ? 'workflow-generator' : 'ai-chat';

                return new Response(stream, {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Service-Name': serviceName,
                    },
                });

            } catch (error) {
                console.error('Error:', error);
                return new Response('Server Error', { status: 500, headers: corsHeaders });
            }
        }

        // --- ENDPOINTS DE WORKFLOWS (AUTOMATIZACIÓN) ---

        // 1. Crear un Workflow (Guardar Receta)
        if (req.method === 'POST' && (pathname === '/api/workflows' || pathname === '/workflows')) {
            const body = await req.json() as { name: string; description?: string; steps: any[] };
            const { name, description, steps } = body;

            if (!name || !steps || !Array.isArray(steps)) {
                return new Response(JSON.stringify({ error: 'Invalid workflow data' }), { status: 400 });
            }

            const result = dbManager.createWorkflow(name, description || '', steps);
            return new Response(JSON.stringify({ success: true, id: result?.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Listar Workflows
        if (req.method === 'GET' && (pathname === '/api/workflows' || pathname === '/workflows')) {
            const flows = dbManager.listWorkflows();
            return new Response(JSON.stringify(flows), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 3. Ejecutar Workflow (RUN)
        // Ejemplo: POST /api/workflows/1/run
        const runMatch = pathname.match(/^\/api\/workflows\/(\d+)\/run$/);
        if (req.method === 'POST' && runMatch) {
            const workflowId = parseInt(runMatch[1]);
            const body = await req.json().catch(() => ({})) as { input?: string };
            const initialContext = body?.input || '';

            try {
                // Ejecutamos en "background" (sin bloquear) o esperamos?
                // Para demo, esperamos el resultado final.
                const { workflowEngine } = await import('./services/workflow');
                const result = await workflowEngine.execute(workflowId, initialContext);

                return new Response(JSON.stringify({ success: true, output: result }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (error) {
                return new Response(JSON.stringify({ success: false, error: String(error) }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // 4. Ejecutar Workflow DIRECTO (sin guardar - para Visual Editor)
        if (req.method === 'POST' && pathname === '/api/workflows/execute-direct') {
            const body = await req.json().catch(() => ({})) as { steps?: any[]; input?: string };
            const { steps, input } = body;

            if (!steps || !Array.isArray(steps) || steps.length === 0) {
                return new Response(JSON.stringify({ success: false, error: 'No steps provided' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            try {
                const { workflowEngine } = await import('./services/workflow');
                const result = await workflowEngine.executeDirect(steps, input || 'Direct execution');

                return new Response(JSON.stringify({ success: true, output: result }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (error) {
                return new Response(JSON.stringify({ success: false, error: String(error) }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // --- API: GESTIÓN DE KEYS (PROTEGIDO POR ADMIN SECRET) ---
        const checkAdmin = () => req.headers.get('X-Admin-Secret') === ADMIN_SECRET;

        if (pathname === '/api/keys') {
            if (!checkAdmin()) return new Response('Unauthorized Admin', { status: 401 });

            if (req.method === 'GET') {
                const keys = dbManager.listKeys();
                return new Response(JSON.stringify(keys), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (req.method === 'POST') {
                // Fix: Explicit type assertion for body
                const body = await req.json() as { name?: string };
                const newKey = dbManager.createKey(body.name || 'Unnamed Project');
                return new Response(JSON.stringify(newKey), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        if (pathname.startsWith('/api/keys/') && req.method === 'DELETE') {
            if (!checkAdmin()) return new Response('Unauthorized Admin', { status: 401 });
            const id = parseInt(pathname.split('/').pop() || '0');
            dbManager.deleteKey(id);
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response('Not Found', { status: 404 });
    },
});