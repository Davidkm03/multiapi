// DOM Elements
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const chatForm = document.getElementById('chat-form');
const sendBtn = document.getElementById('send-btn');
const apiUrlElement = document.getElementById('apiUrl');
const playgroundKeySelect = document.getElementById('playground-key-select');

// State
let conversationHistory = [];
// Auth State (Session Storage to persist Refresh)
let ADMIN_SECRET = sessionStorage.getItem('admin_secret') || null;

// Detect URL automatically
const currentOrigin = window.location.origin;
if (apiUrlElement) apiUrlElement.innerText = `${currentOrigin}/api/chat`;

// --- AUTH & LOGIN LOGIC ---
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

// Check if we are already logged in
if (ADMIN_SECRET) {
    verifyAuth();
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const info = document.getElementById('admin-password').value;

        // Validate against server (we try to list keys as a test)
        if (await testAuth(info)) {
            ADMIN_SECRET = info;
            sessionStorage.setItem('admin_secret', info);
            loginScreen.style.opacity = '0';
            setTimeout(() => loginScreen.style.display = 'none', 300);
            fetchKeys(); // Load initial data
        } else {
            loginError.style.display = 'block';
            loginForm.reset();
        }
    });
}

async function verifyAuth() {
    if (await testAuth(ADMIN_SECRET)) {
        if (loginScreen) loginScreen.style.display = 'none';
        fetchKeys();
    } else {
        // Token invalid or expired
        sessionStorage.removeItem('admin_secret');
        ADMIN_SECRET = null;
    }
}

async function testAuth(secret) {
    try {
        const res = await fetch('/api/keys', {
            headers: { 'X-Admin-Secret': secret }
        });
        return res.status !== 401;
    } catch (e) {
        return false;
    }
}

// --- UI UTILS (Toast & Modals) ---
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-msg').textContent = msg;
    document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '❌';

    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

const modalOverlay = document.getElementById('create-modal-overlay');
const newKeyInput = document.getElementById('new-key-name');

window.createKey = function () {
    if (modalOverlay) {
        modalOverlay.classList.add('active');
        setTimeout(() => newKeyInput.focus(), 100);
    }
};

window.closeModal = function () {
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
        newKeyInput.value = '';
    }
};

window.confirmCreateKey = async function () {
    const name = newKeyInput.value.trim();
    if (!name) return;

    closeModal();

    try {
        const res = await fetch('/api/keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Secret': ADMIN_SECRET
            },
            body: JSON.stringify({ name })
        });

        if (res.ok) {
            fetchKeys();
            showToast('Llave creada correctamente');
        } else {
            showToast('Error al crear llave: ' + res.statusText, 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
};

// Enter in modal input submits
if (newKeyInput) {
    newKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.confirmCreateKey();
    });
}


// --- TAB SWITCHING LOGIC ---
window.switchTab = function (tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.tab-btn');
    if (tabName === 'playground') btns[0].classList.add('active');
    if (tabName === 'keys') {
        btns[1].classList.add('active');
        fetchKeys();
    }
    if (tabName === 'integration') btns[2].classList.add('active');
};

window.switchCode = function (lang) {
    document.querySelectorAll('.code-block').forEach(el => el.classList.remove('active'));
    document.getElementById(`code-${lang}`).classList.add('active');

    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
    const tabs = document.querySelectorAll('.code-tab');
    tabs.forEach(t => {
        if (t.getAttribute('onclick').includes(lang)) t.classList.add('active');
    });
};

window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copiado al portapapeles');
    });
};

// --- KEYS MANAGEMENT LOGIC ---

async function fetchKeys() {
    if (!ADMIN_SECRET) return;

    try {
        const res = await fetch('/api/keys', {
            headers: { 'X-Admin-Secret': ADMIN_SECRET }
        });
        if (res.status === 401) {
            // Logout if session killed or invalid secret
            sessionStorage.removeItem('admin_secret');
            location.reload();
            return;
        }
        const keys = await res.json();
        renderKeysList(keys);
        updatePlaygroundSelector(keys);
    } catch (err) {
        console.error(err);
    }
}

function renderKeysList(keys) {
    const listEl = document.getElementById('keys-list');
    if (keys.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No tienes llaves activas. Crea una para empezar.</div>';
        return;
    }

    listEl.innerHTML = keys.map(k => `
        <div class="key-item">
            <div class="key-info">
                <h3>${k.name}</h3>
                <div class="key-meta">
                    <span>Usos: ${k.usage_count}</span>
                    <span>Creada: ${new Date(k.created_at).toLocaleDateString()}</span>
                </div>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <div class="key-value-blur" onclick="copyToClipboard('${k.key}')" title="Click para copiar">${k.key}</div>
                <button class="delete-btn" onclick="deleteKey(${k.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function updatePlaygroundSelector(keys) {
    if (!playgroundKeySelect) return;
    const currentVal = playgroundKeySelect.value;

    playgroundKeySelect.innerHTML = '<option value="">Selecciona tu API Key...</option>';
    keys.forEach(k => {
        const option = document.createElement('option');
        option.value = k.key;
        option.textContent = `${k.name} (${k.key.substring(0, 8)}...)`;
        playgroundKeySelect.appendChild(option);
    });

    if (currentVal && keys.find(k => k.key === currentVal)) {
        playgroundKeySelect.value = currentVal;
    } else if (keys.length > 0) {
        playgroundKeySelect.value = keys[0].key;
    }
}

window.deleteKey = async function (id) {
    if (!confirm('¿Seguro que quieres borrar esta llave? Dejará de funcionar.')) return;

    try {
        const res = await fetch(`/api/keys/${id}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Secret': ADMIN_SECRET }
        });
        if (res.ok) {
            fetchKeys();
            showToast('Llave eliminada');
        }
    } catch (err) {
        showToast('Error al borrar', 'error');
    }
};

// --- SYSTEM PROMPT CONFIG (AGENT SETTINGS) ---
let systemPrompt = null;
const settingsModal = document.getElementById('settings-modal-overlay');
const systemPromptInput = document.getElementById('system-prompt-input');

window.openSettings = function () {
    if (settingsModal) {
        settingsModal.style.display = 'flex';
        systemPromptInput.value = systemPrompt || '';
        setTimeout(() => systemPromptInput.focus(), 100);
    }
};

window.closeSettings = function () {
    if (settingsModal) settingsModal.style.display = 'none';
};

window.saveSettings = function () {
    const val = systemPromptInput.value.trim();
    systemPrompt = val.length > 0 ? val : null;
    settingsModal.style.display = 'none';

    // Feedback visual
    showToast(systemPrompt ? 'Rol de Agente Actualizado' : 'Modo Chat Estándar', 'success');

    // Gestión Inteligente del Historial
    // Si la conversación apenas empieza, inyectamos el system prompt primero.
    if (conversationHistory.length === 0 && systemPrompt) {
        conversationHistory.push({ role: 'system', content: systemPrompt });
    }
    // Si ya hay historial y el primer mensaje ERA un system prompt, lo actualizamos
    else if (conversationHistory.length > 0 && conversationHistory[0].role === 'system') {
        if (systemPrompt) {
            conversationHistory[0].content = systemPrompt;
        } else {
            conversationHistory.shift(); // Si el usuario lo borró, lo quitamos del historial
        }
    }
    // Si ya hay historial pero NO había system prompt, lo insertamos al inicio
    else if (conversationHistory.length > 0 && systemPrompt) {
        conversationHistory.unshift({ role: 'system', content: systemPrompt });
    }
};

// --- CHAT LOGIC ---

function addMessage(role, content, service = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('msg-bubble');
    bubbleDiv.textContent = content;
    messageDiv.appendChild(bubbleDiv);

    const metaDiv = document.createElement('div');
    metaDiv.classList.add('msg-meta');

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (role === 'assistant') {
        const serviceName = service || 'Unknown';
        metaDiv.innerHTML = `<span class="service-tag ${serviceName.toLowerCase()}">${serviceName}</span> <span>${time}</span>`;

        // Render Markdown Images (Robust)
        const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
        if (content.match(imgRegex)) {
            // Reemplazamos y añadimos manejo de errores
            const html = content.replace(imgRegex, (match, alt, src) => {
                return `<div class="img-wrapper" style="margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
                    <img src="${src}" alt="${alt}" 
                        style="width: 100%; height: auto; display: block; min-height: 200px; background: #222;"
                        onload="this.style.minHeight='auto'"
                        onerror="this.onerror=null; this.src='https://placehold.co/600x400/18181b/FFF?text=Error+Cargando+Imagen';">
                </div>`;
            });
            bubbleDiv.innerHTML = html;
        } else {
            bubbleDiv.textContent = content;
        }

    } else {
        metaDiv.textContent = time;
        bubbleDiv.textContent = content;
    }

    messageDiv.appendChild(metaDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return bubbleDiv;
}

// --- IMAGE UPLOAD LOGIC ---
let selectedImageBase64 = null;

const imageUploadInput = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreviewEl = document.getElementById('image-preview');

if (imageUploadInput) {
    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            selectedImageBase64 = evt.target.result;
            imagePreviewEl.src = selectedImageBase64;
            imagePreviewContainer.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    });
}

window.clearImageSelection = function () {
    selectedImageBase64 = null;
    imageUploadInput.value = ''; // Reset input
    imagePreviewContainer.style.display = 'none';
};

async function sendMessage(e) {
    if (e) e.preventDefault();

    const text = messageInput.value.trim();
    // Permitimos enviar si hay texto O imagen
    if (!text && !selectedImageBase64) return;

    const apiKey = playgroundKeySelect.value;
    if (!apiKey) {
        showToast('Selecciona una API Key primero', 'error');
        switchTab('keys');
        return;
    }

    messageInput.value = '';

    // UI Updates
    messageInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';

    // Construimos el mensaje de usuario
    // Si hay imagen, la mostramos en el chat también
    if (selectedImageBase64) {
        // Pseudo-markdown para mostrar imagen localmente
        const imgMarkdown = `\n![Uploaded Image](${selectedImageBase64})`;
        addMessage('user', text + imgMarkdown);
        conversationHistory.push({ role: 'user', content: text + imgMarkdown });

        // Limpiamos selección visual
        clearImageSelection();
    } else {
        addMessage('user', text);
        conversationHistory.push({ role: 'user', content: text });
    }

    const responseBubble = addMessage('assistant', 'Pensando...');
    let fullResponse = '';

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // Send Selected Key
            },
            body: JSON.stringify({ messages: conversationHistory }),
        });

        if (response.status === 401) {
            throw new Error('API Key inválida o no autorizada');
        }

        if (!response.ok) throw new Error('Network error');

        const serviceName = response.headers.get('X-Service-Name') || 'AI';
        const metaTag = responseBubble.parentElement.querySelector('.service-tag');
        if (metaTag) {
            metaTag.textContent = serviceName;
            metaTag.className = `service-tag ${serviceName.toLowerCase()}`;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        responseBubble.textContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;

            // Simple markdown image render for streaming content
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            if (fullResponse.match(imgRegex)) {
                const html = fullResponse.replace(imgRegex, (match, alt, src) => {
                    return `<div class="img-wrapper" style="margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
                        <img src="${src}" alt="${alt}" 
                            style="width: 100%; height: auto; display: block; min-height: 200px; background: #222;"
                            onload="this.style.minHeight='auto'"
                            onerror="this.onerror=null; this.src='https://placehold.co/600x400/18181b/FFF?text=Error+Cargando+Imagen';">
                    </div>`;
                });
                responseBubble.innerHTML = html;
            } else {
                responseBubble.textContent = fullResponse;
            }

            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Optimización de Historial: NO guardar el Base64 gigante en el historial de contexto
        // Si guardamos la imagen completa, reventamos el límite de tokens de Groq/Cerebras (Error 413)
        // Guardamos solo un placeholder text para que la IA sepa que hizo una imagen, pero no consuma mem.

        let historyContent = fullResponse;
        if (fullResponse.includes('data:image')) {
            historyContent = fullResponse.replace(/\(data:image\/[^)]+\)/g, '(imagen_generada_placeholder)');
        }

        conversationHistory.push({ role: 'assistant', content: historyContent });

        // Refresh usage count in background quietly if we are on keys tab
        // fetchKeys(); 

    } catch (error) {
        console.error(error);
        responseBubble.textContent = `Error: ${error.message}`;
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        messageInput.focus();
    }
}

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

chatForm.addEventListener('submit', sendMessage);
