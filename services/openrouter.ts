import OpenAI from 'openai';
import type { AIService, ChatMessage } from '../types';

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || 'dummy-key',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
        'HTTP-Referer': 'https://bun-ai-api.local', // Required by OpenRouter
        'X-Title': 'Bun AI API', // Optional
    },
});

// Usamos un modelo gratuito disponible en OpenRouter
const MODEL = 'meta-llama/llama-3-8b-instruct:free';

export const openRouterService: AIService = {
    name: 'openrouter',
    async *chat(messages: ChatMessage[]) {
        try {
            const completion = await client.chat.completions.create({
                model: MODEL,
                messages: messages,
                stream: true,
            });

            for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    yield content;
                }
            }
        } catch (error) {
            console.error('Error in OpenRouter service:', error);
            yield `[Error with OpenRouter: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
