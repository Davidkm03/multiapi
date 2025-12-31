import Cerebras from '@cerebras/cerebras_cloud_sdk';
import type { AIService, ChatMessage } from '../types';

const apiKey = process.env.CEREBRAS_API_KEY;
let client: Cerebras | null = null;

if (apiKey) {
    try {
        client = new Cerebras({ apiKey });
    } catch (e) {
        console.warn('Failed to initialize Cerebras client:', e);
    }
} else {
    console.warn('CEREBRAS_API_KEY not found. Cerebras service will be disabled.');
}

// NOTE: Check official model names. 'zai-glm-4.6' implies a specific model, ensure it's correct for Cerebras.
// Common Cerebras models are like 'llama3.1-70b' or similar. 
const MODEL = 'llama3.1-70b';

export const cerebrasService: AIService = {
    name: 'cerebras',
    async *chat(messages: ChatMessage[]) {
        if (!client) {
            yield "[Error: CEREBRAS_API_KEY is missing in .env. Please add it to use this service.]";
            return;
        }

        try {
            const stream = await client.chat.completions.create({
                messages: messages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                })),
                model: MODEL,
                stream: true,
                max_completion_tokens: 8192, // Adjusted to a safer limit
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
            yield `[Error with Cerebras: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
