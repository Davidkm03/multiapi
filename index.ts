import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import { sambaNovaService } from './services/sambanova';
import { imageService } from './services/images';
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

                // DETECTAR INTENCIÓN DE IMAGEN (Smart Routing)
                const lastMessage = sanitizedMessages[sanitizedMessages.length - 1];
                const content = lastMessage?.content?.trim().toLowerCase() || '';

                // Triggers: Comandos explícitos o lenguaje natural
                const isImageRequest =
                    content.startsWith('/img') ||
                    content.startsWith('dibuja') ||
                    content.startsWith('crea una imagen') ||
                    content.startsWith('genera una imagen') ||
                    content.includes('generame una imagen');

                let service: AIService;

                if (isImageRequest) {
                    service = imageService;
                    console.log(`🎨 Smart Routing: Image intent detected causing switch to Image Service. Key: ${apiKey.slice(0, 8)}...`);
                } else {
                    service = getNextService();
                    console.log(`Using [${service.name}] service for key: ${apiKey.slice(0, 8)}...`);
                }

                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of service.chat(sanitizedMessages)) {
                                controller.enqueue(new TextEncoder().encode(chunk));
                            }
                            controller.close();
                        } catch (err) {
                            console.error(err);
                            controller.error(err);
                        }
                    },
                });

                return new Response(stream, {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Service-Name': service.name,
                    },
                });

            } catch (error) {
                console.error('Error:', error);
                return new Response('Server Error', { status: 500, headers: corsHeaders });
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