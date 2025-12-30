import { groqService } from './services/groq';
import { cerebrasService } from './services/cerebras';
import { geminiService } from './services/gemini';
import { openRouterService } from './services/openrouter';
import type { AIService, ChatMessage } from './types';

// Configuración
const PORT = process.env.PORT || 3000;

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

        // Servir archivos estáticos del frontend
        if (req.method === 'GET') {
            if (pathname === '/') {
                return new Response(Bun.file('public/index.html'));
            }
            // Intentar servir archivo si existe en public
            const publicFile = Bun.file(`public${pathname}`);
            if (await publicFile.exists()) {
                return new Response(publicFile);
            }
        }

        // Endpoint de CHAT
        if (req.method === 'POST' && pathname === '/chat') {
            try {
                const body = await req.json();
                const messages = body.messages as ChatMessage[];

                if (!Array.isArray(messages)) {
                    return new Response('Invalid messages format', { status: 400 });
                }

                const service = getNextService();
                console.log(`Using [${service.name}] service`);

                // Crear stream
                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            // Yield chunk inicial con el nombre del servicio para el frontend (opcional o vía header)
                            // Pero el formato SSE estándar es data: ...
                            // Aquí haremos raw streaming de texto como pide el usuario ("mostrar texto en tiempo real")
                            // OJO: El usuario pidió "mostrar qué servicio respondió" en el frontend.
                            // Una forma es mandar un header custom.

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

                // Retornar respuesta con headers adecuados
                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Service-Name': service.name, // Header custom para saber quién respondió
                    },
                });

            } catch (error) {
                console.error('Error processing chat request:', error);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    },
});