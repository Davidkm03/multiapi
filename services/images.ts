import type { AIService, ChatMessage } from '../types';

export const imageService: AIService = {
    name: 'pollinations', // Image Gen
    async *chat(messages: ChatMessage[]) {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || !lastMsg.content) {
            yield '[Error: No prompt provided]';
            return;
        }

        // Detección de Imagen adjunta (Img2Img)
        const imgMatch = lastMsg.content.match(/!\[.*?\]\((data:image\/.*?;base64,.*?)\)/);
        const inputImageBase64 = imgMatch ? imgMatch[1] : null;

        // Limpiamos el prompt Texto
        let prompt = lastMsg.content
            .replace(/!\[.*?\]\(data:image\/.*?\)/g, '')
            .replace(/^\/img\s+/, '')
            .replace(/^(dibuja|crea|genera|modifica|haz).+?(imagen|dibujo|foto)\s+(de\s+)?/i, '')
            .trim();

        if (!prompt && inputImageBase64) prompt = "variation of this image";

        // Lógica de Img2Img desde Localhost
        if (inputImageBase64) {
            yield `⚠️ **Nota sobre Img2Img**:
            
Detecté que subiste una imagen para modificarla.
Actualmente, Pollinations requiere que la imagen de origen sea una **URL pública** (ej: http://imgur.com/foto.jpg) para poder procesarla. 

Como tu imagen está en tu ordenador local (Localhost), la IA no puede "verla". 
Por favor, **escribe un prompt** describiendo lo que quieres crear desde cero, o proporciona una URL de imagen pública.`;
            return;
        }

        // Lógica Normal Text-to-Image con ESTRATEGIA VIP HÍBRIDA
        // 1. Intentamos 'turbo' en API Oficial (Rápido, VIP, Sin Rate Limits).
        // 2. Si falla, fallback a 'flux' (Estable).

        const safePrompt = encodeURIComponent(prompt);
        const seed = Math.floor(Math.random() * 1000000);
        const apiKey = process.env.POLLINATIONS_API_KEY;

        // Intento 1: TURBO (VIP)
        const primaryModel = 'turbo';
        const primaryUrl = `https://gen.pollinations.ai/image/${safePrompt}?width=1024&height=1024&seed=${seed}&model=${primaryModel}&nologo=true`;

        try {
            console.log(`\n============== PROCESO DE IMAGEN (VIP SYSTEM) =============`);
            console.log(`🖼️  Prompt: "${prompt}"`);
            console.log(`� Intento 1: Modelo '${primaryModel}' en API Oficial...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);

            const headers: Record<string, string> = {
                'User-Agent': 'Bun AI Proxy',
                'Accept': 'image/*'
            };

            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            let response = await fetch(primaryUrl, { headers, signal: controller.signal });
            clearTimeout(timeoutId);

            // LOGICA DE FALLBACK AUTOMÁTICO
            if (!response.ok) {
                console.warn(`⚠️ Error en modelo '${primaryModel}' (${response.status}). Cambiando a 'flux'...`);

                // Intento 2: FLUX (Fallback Estable)
                const fallbackUrl = `https://gen.pollinations.ai/image/${safePrompt}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
                console.log(`🔄 Reintentando con Flux: ${fallbackUrl}`);

                const controller2 = new AbortController();
                const timeoutId2 = setTimeout(() => controller2.abort(), 60000); // 60s timeout para Flux

                response = await fetch(fallbackUrl, { headers, signal: controller2.signal });
                clearTimeout(timeoutId2);

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Fallback Failed: ${response.status} - ${errText.slice(0, 100)}`);
                }
            }

            console.log(`✅ Conexión establecida. Status: ${response.status}`);

            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.startsWith('image/')) {
                const text = await response.text();
                throw new Error(`API returned non-image (${contentType}): ${text.slice(0, 100)}`);
            }

            console.log(`📥 Descargando imagen...`);
            const arrayBuffer = await response.arrayBuffer();
            console.log(`💾 Descarga completa. Tamaño: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);

            const buffer = Buffer.from(arrayBuffer);
            const base64Image = buffer.toString('base64');
            const finalContentType = contentType || 'image/jpeg';
            const dataUrl = `data:${finalContentType};base64,${base64Image}`;

            console.log(`✨ Imagen procesada.`);
            console.log(`==============================================\n`);

            yield `Aquí tienes tu imagen generada (Vía API VIP):\n\n![${prompt}](${dataUrl})`;

        } catch (error) {
            console.error('Error fetching image:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('aborted')) {
                yield `Lo siento, el servidor tardó demasiado. Intenta con un prompt más simple.`;
            } else {
                yield `Error generando imagen: ${errorMsg}. Verifica tu API Key o intenta más tarde.`;
            }
        }
    },
};
