import Groq from 'groq-sdk';
import type { AIService, ChatMessage } from '../types';

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy-key',
});

// Modelo especificado por el usuario
const MODEL = 'moonshotai/kimi-k2-instruct-0905'; // OJO: Verificar si Groq soporta este modelo, de lo contrario fallback a llama-3

export const groqService: AIService = {
    name: 'groq',
    async *chat(messages: ChatMessage[]) {
        try {
            const chatCompletion = await client.chat.completions.create({
                messages: messages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                })),
                model: MODEL,
                temperature: 0.6,
                max_completion_tokens: 4096,
                top_p: 1,
                stream: true,
            });

            for await (const chunk of chatCompletion) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    yield content;
                }
            }
        } catch (error) {
            console.error('Error in Groq service:', error);
            yield `[Error with Groq: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
