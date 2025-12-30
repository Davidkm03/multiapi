import OpenAI from 'openai';
import type { AIService, ChatMessage } from '../types';

const client = new OpenAI({
    apiKey: process.env.SAMBANOVA_API_KEY || 'dummy-key',
    baseURL: 'https://api.sambanova.ai/v1',
});

// El modelo gigante: Llama 3.1 405B Instruct
const MODEL = 'Meta-Llama-3.1-405B-Instruct';

export const sambaNovaService: AIService = {
    name: 'sambanova',
    async *chat(messages: ChatMessage[]) {
        try {
            const completion = await client.chat.completions.create({
                model: MODEL,
                messages: messages,
                stream: true,
                temperature: 0.7,
                top_p: 0.9,
            });

            for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    yield content;
                }
            }
        } catch (error) {
            console.error('Error in SambaNova service:', error);
            yield `[Error with SambaNova: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
