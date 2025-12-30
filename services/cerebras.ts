import Cerebras from '@cerebras/cerebras_cloud_sdk';
import type { AIService, ChatMessage } from '../types';

const client = new Cerebras({
    apiKey: process.env.CEREBRAS_API_KEY,
});

const MODEL = 'zai-glm-4.6';

export const cerebrasService: AIService = {
    name: 'cerebras',
    async *chat(messages: ChatMessage[]) {
        try {
            const stream = await client.chat.completions.create({
                messages: messages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                })),
                model: MODEL,
                stream: true,
                max_completion_tokens: 40960,
                temperature: 0.6,
                top_p: 0.95
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    yield content;
                }
            }
        } catch (error) {
            console.error('Error in Cerebras service:', error);
            // Si falta la key o falla, es mejor que falle silenciosamente o de un mensaje corto para que el round-robin siga (aunque aquí estoy devolviendo el error al chat)
            // En un sistema real de round-robin, si uno falla, deberíamos lanzar error para que el manager intente con el siguiente, 
            // pero como mi implementación de round-robin en index.ts es simple (pasa al siguiente turno, no al siguiente en caso de error), mostraré el error.
            yield `[Error with Cerebras: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
