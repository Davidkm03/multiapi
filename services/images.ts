import type { AIService, ChatMessage } from '../types';

export const imageService: AIService = {
    name: 'pollinations', // Image Gen
    async *chat(messages: ChatMessage[]) {
        const lastMsg = messages[messages.length - 1];
        const prompt = lastMsg.content
            .replace(/^\/img\s+/, '')
            .replace(/^(dibuja|crea|genera).+?(imagen|dibujo)\s+(de\s+)?/i, '')
            .trim();

        const safePrompt = encodeURIComponent(prompt);
        const seed = Math.floor(Math.random() * 1000000);

        // Usamos la API Oficial Gen con Autenticación
        // Docs: https://gen.pollinations.ai/image/{prompt}
        const imageUrl = `https://gen.pollinations.ai/image/${safePrompt}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
        const apiKey = process.env.POLLINATIONS_API_KEY;

        try {
            console.log(`🖼️ Fetching image from: ${imageUrl}`);

            const headers: Record<string, string> = {
                'User-Agent': 'Bun AI Proxy',
                'Accept': 'image/*'
            };

            // Solo añadimos Auth si existe la key
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            // Backend Proxy con Autenticación
            const response = await fetch(imageUrl, { headers });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Pollinations API Error: ${response.status} - ${errText.slice(0, 100)}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.startsWith('image/')) {
                const text = await response.text();
                throw new Error('La API devolvió algo que no es una imagen.');
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');
            const finalContentType = contentType || 'image/jpeg';
            const dataUrl = `data:${finalContentType};base64,${base64Image}`;

            yield `Aquí tienes tu imagen generada con Flux (Vía API Oficial):\n\n![${prompt}](${dataUrl})`;

        } catch (error) {
            console.error('Error fetching image:', error);
            yield `Lo siento, hubo un error generando la imagen: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
};
