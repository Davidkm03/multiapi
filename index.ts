import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import { dbManager } from './db';
import type { AIService, ChatMessage } from './types';

// Configuración
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123'; // Contraseña simple para el dashboard

// Lista de servicios disponibles
const aiServices: AIService[] = [
    groqService,
    cerebrasService,
    geminiService,
    openRouterService,
];

// Estado para rotación Round-Robin
let currentServiceIndex = 0;

function getNextService(): AIService {
    const service = aiServices[currentServiceIndex];
    currentServiceIndex = (currentServiceIndex + 1) % aiServices.length;
    return service;
}

console.log(`🚀 AI Proxy API running at http://localhost:${PORT}`);

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        const { pathname } = url;

        // CORS Headers helper
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret'
        };

        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // --- PUBLIC STATIC FILES ---
        if (req.method === 'GET') {
            if (pathname === '/') return new Response(Bun.file('public/index.html'));
            const publicFile = Bun.file(`public${pathname}`);
            if (await publicFile.exists()) return new Response(publicFile);
        }

        // --- API: CHAT (PROTEGIDO POR API KEY) ---
        if (req.method === 'POST' && (pathname === '/chat' || pathname === '/api/chat')) {
            // Verificar Auth Header
            const authHeader = req.headers.get('Authorization');
            const apiKey = authHeader?.replace('Bearer ', '');

            // Permitir localhost sin key para pruebas rápidas O forzar key siempre
            // Para este caso "Dashboard real", vamos a requerir key o verificar si viene del Playground local (que ajustaremos luego)
            // Por ahora, validamos contra DB
            if (!apiKey || !dbManager.validateAndTrack(apiKey)) {
                return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API Key' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            try {
                const body = await req.json();
                const messages = body.messages as ChatMessage[];

                if (!Array.isArray(messages)) {
                    return new Response('Invalid messages format', { status: 400, headers: corsHeaders });
                }

                const service = getNextService();
                console.log(`Using [${service.name}] service for key: ${apiKey.slice(0, 8)}...`);

                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of service.chat(messages)) {
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
                console.error('Error processing chat request:', error);
                return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
            }
        }

        // --- API: GESTIÓN DE KEYS (PROTEGIDO POR ADMIN SECRET) ---
        // Headers: X-Admin-Secret: admin123

        // Middleware Admin simple
        const checkAdmin = () => req.headers.get('X-Admin-Secret') === ADMIN_SECRET;

        if (pathname === '/api/keys') {
            if (!checkAdmin()) return new Response('Unauthorized Admin', { status: 401 });

            if (req.method === 'GET') {
                const keys = dbManager.listKeys();
                return new Response(JSON.stringify(keys), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (req.method === 'POST') {
                const body = await req.json();
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