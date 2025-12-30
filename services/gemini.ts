import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIService, ChatMessage } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL_NAME = 'gemini-1.5-flash';

export const geminiService: AIService = {
    name: 'gemini',
    async *chat(messages: ChatMessage[]) {
        try {
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });

            // Convertir formato de mensajes
            // Gemini espera history + último mensaje, o formato específico
            // Simplificación: Unimos mensajes o usamos el chat session

            const history = messages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

            const lastMessage = messages[messages.length - 1];
            const chatSession = model.startChat({
                history: history as any,
            });

            const result = await chatSession.sendMessageStream(lastMessage.content);

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) {
                    yield chunkText;
                }
            }
        } catch (error) {
            console.error('Error in Gemini service:', error);
            yield `[Error with Gemini: ${error instanceof Error ? error.message : String(error)}]`;
        }
    },
};
