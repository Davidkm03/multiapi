const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const chatForm = document.getElementById('chat-form');
const serviceIndicator = document.getElementById('service-indicator');
const serviceNameSpan = document.getElementById('service-name');
const sendBtn = document.getElementById('send-btn');

let conversationHistory = [];

function addMessage(role, content, service = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    // Si es del asistente, le agregamos clase específica si sabemos el servicio
    if (role === 'assistant' && service) {
        messageDiv.classList.add(`service-${service}`);
    }

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.textContent = content; // Usar textContent para evitar XSS básico
    messageDiv.appendChild(contentDiv);

    if (role === 'assistant' && service) {
        const badge = document.createElement('div');
        badge.classList.add('service-badge');
        badge.textContent = service;
        messageDiv.appendChild(badge);
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return contentDiv; // Retornamos el div de contenido para actualizarlo en streaming
}

async function sendMessage(e) {
    if (e) e.preventDefault();

    const text = messageInput.value.trim();
    if (!text) return;

    // UI Updates
    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;

    // Agregar mensaje de usuario
    addMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    // Crear placeholder para respuesta
    const responseContentDiv = addMessage('assistant', '...');
    let fullResponse = '';
    let currentService = '';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: conversationHistory }),
        });

        if (!response.ok) throw new Error('Network response was not ok');

        // Detectar servicio desde header custom
        const serviceHeader = response.headers.get('X-Service-Name');
        if (serviceHeader) {
            currentService = serviceHeader;
            // Actualizar el indicador inmediatamente
            const parentMsg = responseContentDiv.parentElement;
            parentMsg.classList.add(`service-${currentService}`);
            const badge = parentMsg.querySelector('.service-badge');
            if (badge) badge.textContent = currentService;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Limpiar el "..." inicial
        responseContentDiv.textContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            responseContentDiv.textContent = fullResponse;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Agregar a la historia
        conversationHistory.push({ role: 'assistant', content: fullResponse });

    } catch (error) {
        console.error('Error:', error);
        responseContentDiv.textContent = 'Error al obtener respuesta. Intenta de nuevo.';
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

chatForm.addEventListener('submit', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
