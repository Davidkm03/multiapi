import type { ChatMessage } from '../types';
import { groqService } from './groq';

// System prompt for workflow generation
const WORKFLOW_SYSTEM_PROMPT = `Eres un experto en automatización y creación de workflows para n8n. 
Cuando el usuario pida crear una automatización, debes responder con un JSON válido de n8n.

IMPORTANTE:
1. Siempre responde con un bloque de código JSON que contiene el workflow
2. El JSON debe seguir el formato de n8n exactamente
3. Incluye nodos trigger, code, httpRequest según sea necesario
4. Usa URLs reales de APIs cuando sea posible
5. Agrega comentarios explicativos FUERA del JSON

FORMATO DE RESPUESTA:
Primero explica brevemente qué hará el workflow, luego incluye:

\`\`\`json
{
  "name": "Nombre del Workflow",
  "nodes": [...],
  "connections": {...}
}
\`\`\`

NODOS DISPONIBLES:
- manualTrigger: Inicio manual
- scheduleTrigger: Programado (cron)
- webhook: Recibe HTTP requests
- httpRequest: Llama APIs externas
- code: Ejecuta JavaScript
- emailSend: Envía emails
- if: Condiciones

INTEGRACIONES COMUNES:
- Facebook Graph API: https://graph.facebook.com/v18.0/
- Twitter API: https://api.twitter.com/2/
- Telegram Bot: https://api.telegram.org/bot{token}/
- Discord Webhook: https://discord.com/api/webhooks/
- Slack: https://hooks.slack.com/services/
- OpenAI: https://api.openai.com/v1/

Para tokens/API keys, usa placeholders como:
- YOUR_ACCESS_TOKEN
- YOUR_API_KEY
- YOUR_PAGE_ID`;

// Detect if user is asking for an automation/workflow
export function isWorkflowRequest(content: string): boolean {
    const lower = content.toLowerCase();
    const triggers = [
        'crea una automatización',
        'crea una automatizacion',
        'crear automatización',
        'crear automatizacion',
        'genera un workflow',
        'generar workflow',
        'automatiza',
        'automatizar',
        'crea un flujo',
        'crear flujo',
        'workflow para',
        'automatización para',
        'automatizacion para',
        'publicar automáticamente',
        'publicar automaticamente',
        'enviar automáticamente',
        'enviar automaticamente',
        'programar publicación',
        'programar publicacion',
        'bot que',
        'quiero automatizar',
        '/workflow',
        '/auto'
    ];

    return triggers.some(t => lower.includes(t));
}

// Generate workflow using AI
export async function* generateWorkflow(userRequest: string): AsyncGenerator<string> {
    const messages: ChatMessage[] = [
        { role: 'system', content: WORKFLOW_SYSTEM_PROMPT },
        { role: 'user', content: userRequest }
    ];

    console.log('[WorkflowGen] Generating workflow for:', userRequest.substring(0, 50));

    for await (const chunk of groqService.chat(messages)) {
        yield chunk;
    }
}

// Extract JSON from AI response
export function extractWorkflowJson(response: string): object | null {
    try {
        // Try to find JSON in code block
        const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1].trim());
        }

        // Try to find raw JSON
        const rawMatch = response.match(/\{[\s\S]*"name"[\s\S]*"nodes"[\s\S]*\}/);
        if (rawMatch) {
            return JSON.parse(rawMatch[0]);
        }

        return null;
    } catch (error) {
        console.error('[WorkflowGen] Failed to parse JSON:', error);
        return null;
    }
}

// Workflow templates for common use cases
export const workflowTemplates = {
    facebook: {
        name: "Publicar en Facebook",
        description: "Publica contenido automáticamente en tu página de Facebook",
        nodes: [
            {
                id: "trigger",
                name: "Ejecutar",
                type: "n8n-nodes-base.manualTrigger",
                position: [240, 300],
                parameters: {}
            },
            {
                id: "content",
                name: "Preparar Contenido",
                type: "n8n-nodes-base.code",
                position: [460, 300],
                parameters: {
                    jsCode: `// Personaliza tu mensaje aquí
return {
  message: "¡Hola desde mi automatización! 🚀",
  link: "" // Opcional: URL para compartir
};`
                }
            },
            {
                id: "post",
                name: "Publicar en Facebook",
                type: "n8n-nodes-base.httpRequest",
                position: [680, 300],
                parameters: {
                    method: "POST",
                    url: "=https://graph.facebook.com/v18.0/YOUR_PAGE_ID/feed",
                    authentication: "genericCredentialType",
                    sendBody: true,
                    bodyParameters: {
                        parameters: [
                            { name: "message", value: "={{ $json.message }}" },
                            { name: "access_token", value: "YOUR_ACCESS_TOKEN" }
                        ]
                    }
                }
            }
        ],
        connections: {
            "Ejecutar": { main: [[{ node: "Preparar Contenido", type: "main", index: 0 }]] },
            "Preparar Contenido": { main: [[{ node: "Publicar en Facebook", type: "main", index: 0 }]] }
        }
    },

    telegram: {
        name: "Bot de Telegram",
        description: "Envía mensajes automáticos por Telegram",
        nodes: [
            {
                id: "trigger",
                name: "Ejecutar",
                type: "n8n-nodes-base.manualTrigger",
                position: [240, 300],
                parameters: {}
            },
            {
                id: "send",
                name: "Enviar Mensaje",
                type: "n8n-nodes-base.httpRequest",
                position: [460, 300],
                parameters: {
                    method: "POST",
                    url: "=https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage",
                    sendBody: true,
                    bodyParameters: {
                        parameters: [
                            { name: "chat_id", value: "YOUR_CHAT_ID" },
                            { name: "text", value: "Mensaje automático desde mi workflow" },
                            { name: "parse_mode", value: "HTML" }
                        ]
                    }
                }
            }
        ],
        connections: {
            "Ejecutar": { main: [[{ node: "Enviar Mensaje", type: "main", index: 0 }]] }
        }
    },

    discord: {
        name: "Notificación Discord",
        description: "Envía notificaciones a un canal de Discord",
        nodes: [
            {
                id: "trigger",
                name: "Ejecutar",
                type: "n8n-nodes-base.manualTrigger",
                position: [240, 300],
                parameters: {}
            },
            {
                id: "webhook",
                name: "Discord Webhook",
                type: "n8n-nodes-base.httpRequest",
                position: [460, 300],
                parameters: {
                    method: "POST",
                    url: "YOUR_DISCORD_WEBHOOK_URL",
                    sendBody: true,
                    specifyBody: "json",
                    jsonBody: JSON.stringify({
                        content: "Notificación automática",
                        embeds: [{
                            title: "Título del Embed",
                            description: "Descripción aquí",
                            color: 5814783
                        }]
                    })
                }
            }
        ],
        connections: {
            "Ejecutar": { main: [[{ node: "Discord Webhook", type: "main", index: 0 }]] }
        }
    }
};
