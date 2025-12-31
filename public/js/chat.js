import { showToast } from './utils.js';

let systemPrompt = null;
const conversationHistory = [];

export function getSystemPrompt() {
    return systemPrompt;
}

export function initSettings() {
    const settingsModal = document.getElementById('settings-modal-overlay');
    const systemPromptInput = document.getElementById('system-prompt-input');

    // Funciones globales para botones onclick
    window.openSettings = function () {
        console.log('Open Settings Clicked'); // Debug
        if (settingsModal) {
            settingsModal.style.display = 'flex';
            systemPromptInput.value = systemPrompt || '';
            settingsModal.classList.add('active'); // Ensure opacity transition if CSS supports it
            setTimeout(() => systemPromptInput.focus(), 100);
        } else {
            console.error('Settings modal not found');
        }
    };

    window.closeSettings = function () {
        if (settingsModal) {
            settingsModal.style.display = 'none';
            settingsModal.classList.remove('active');
        }
    };

    window.saveSettings = function () {
        const val = systemPromptInput.value.trim();
        systemPrompt = val.length > 0 ? val : null;
        if (settingsModal) settingsModal.style.display = 'none';

        showToast(systemPrompt ? 'Rol de Agente Actualizado' : 'Modo Chat Estándar', 'success');

        // Logic to insert system prompt in history
        if (conversationHistory.length === 0 && systemPrompt) {
            conversationHistory.push({ role: 'system', content: systemPrompt });
        } else if (conversationHistory.length > 0 && conversationHistory[0].role === 'system') {
            if (systemPrompt) conversationHistory[0].content = systemPrompt;
            else conversationHistory.shift();
        } else if (conversationHistory.length > 0 && systemPrompt) {
            conversationHistory.unshift({ role: 'system', content: systemPrompt });
        }
    };
}

export async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages-container');
    const playgroundKeySelect = document.getElementById('playground-key-select');

    // Image stuff (would be passed properly in robust architecture)
    const imagePreviewEl = document.getElementById('image-preview');
    let selectedImageBase64 = imagePreviewEl && imagePreviewEl.src.startsWith('data:') ? imagePreviewEl.src : null;

    const text = messageInput.value.trim();
    if (!text && !selectedImageBase64) return;

    const apiKey = playgroundKeySelect ? playgroundKeySelect.value : null;

    if (!apiKey) {
        showToast('Selecciona una API Key primero', 'error');
        // trigger switch tab
        return;
    }

    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';

    // Add User Message
    if (selectedImageBase64) {
        const imgMarkdown = `\n![Uploaded Image](${selectedImageBase64})`;
        addMessage('user', text + imgMarkdown);
        conversationHistory.push({ role: 'user', content: text + imgMarkdown });
        // Clear image
        window.clearImageSelection();
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
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ messages: conversationHistory }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(err || response.statusText);
        }

        const serviceName = response.headers.get('X-Service-Name') || 'AI';
        const isWorkflowResponse = serviceName === 'workflow-generator';

        const metaTag = responseBubble.parentElement.querySelector('.service-tag');
        if (metaTag) {
            metaTag.textContent = isWorkflowResponse ? 'Workflow Generator' : serviceName;
            metaTag.className = `service-tag ${serviceName.toLowerCase()}`;
        }

        // If workflow response, show different initial message
        if (isWorkflowResponse) {
            responseBubble.innerHTML = '<span style="color: var(--primary);">Generando automatización...</span>';
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        if (!isWorkflowResponse) {
            responseBubble.textContent = '';
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;

            // For non-workflow responses, render normally
            if (!isWorkflowResponse) {
                renderMarkdown(responseBubble, fullResponse);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }

        // Handle workflow response - auto import
        if (isWorkflowResponse) {
            const workflow = extractWorkflowFromResponse(fullResponse);

            if (workflow) {
                // Update chat with success message
                responseBubble.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; color: #22c55e;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <span>¡Workflow "${workflow.name || 'Automatización'}" creado!</span>
                    </div>
                    <p style="margin-top: 10px; color: var(--text-muted); font-size: 0.9rem;">
                        Abriendo el editor visual...
                    </p>
                `;

                // Auto switch to workflow editor and import
                setTimeout(() => {
                    // Switch to workflow editor tab
                    window.__chatUtils?.switchTab?.('workflows');

                    // Wait for editor to initialize and import
                    const tryImport = (attempts = 0) => {
                        if (window.importN8nWorkflow) {
                            console.log('[Chat] Importing workflow to editor...');
                            window.importN8nWorkflow(workflow);
                            showToast('Workflow importado - ¡Listo para ejecutar!');
                        } else if (attempts < 10) {
                            console.log('[Chat] Waiting for editor...', attempts);
                            setTimeout(() => tryImport(attempts + 1), 300);
                        } else {
                            console.error('[Chat] Editor not available after retries');
                            showToast('Error: Editor no disponible', 'error');
                        }
                    };

                    // Start trying after a short delay
                    setTimeout(() => tryImport(), 500);
                }, 300);

                // Add simplified content to history
                conversationHistory.push({
                    role: 'assistant',
                    content: `Workflow creado: ${workflow.name}`
                });
            } else {
                // Couldn't extract workflow, show raw response
                renderMarkdown(responseBubble, fullResponse);
                conversationHistory.push({ role: 'assistant', content: fullResponse });
            }
        } else {
            // Normal response - add to history
            let historyContent = fullResponse;
            if (fullResponse.includes('data:image')) {
                historyContent = fullResponse.replace(/\(data:image\/[^)]+\)/g, '(imagen_generada_placeholder)');
            }
            conversationHistory.push({ role: 'assistant', content: historyContent });
        }

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

// Helper to extract workflow JSON from AI response
function extractWorkflowFromResponse(response) {
    try {
        // Try to find JSON in code block
        const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (parsed.name && parsed.nodes) {
                return parsed;
            }
        }

        // Try to find raw JSON object with workflow structure
        const rawMatch = response.match(/\{\s*"name"\s*:\s*"[^"]+"\s*,[\s\S]*?"nodes"\s*:\s*\[[\s\S]*?\]\s*,[\s\S]*?"connections"\s*:/);
        if (rawMatch) {
            // Find the full JSON object
            let depth = 0;
            let start = response.indexOf(rawMatch[0]);
            let end = start;

            for (let i = start; i < response.length; i++) {
                if (response[i] === '{') depth++;
                if (response[i] === '}') depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }

            if (end > start) {
                const parsed = JSON.parse(response.substring(start, end));
                if (parsed.name && parsed.nodes) {
                    return parsed;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error extracting workflow:', error);
        return null;
    }
}

function addMessage(role, content) {
    const messagesContainer = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('msg-bubble');
    renderMarkdown(bubbleDiv, content);

    messageDiv.appendChild(bubbleDiv);

    const metaDiv = document.createElement('div');
    metaDiv.classList.add('msg-meta');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (role === 'assistant') {
        metaDiv.innerHTML = `<span class="service-tag system">SYSTEM</span> <span>${time}</span>`;
    } else {
        metaDiv.textContent = time;
    }

    messageDiv.appendChild(metaDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubbleDiv;
}

function renderMarkdown(element, text) {
    // Check for images - improved regex for nested brackets in alt text
    const imgRegex = /!\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\((data:image\/[^)]+)\)/g;

    // Check for code blocks (including JSON)
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;

    let html = text;

    // Replace code blocks first
    html = html.replace(codeBlockRegex, (match, lang, code) => {
        const language = lang || 'code';
        const isJson = language.toLowerCase() === 'json';

        // Check if this is a workflow JSON
        let isWorkflow = false;
        let workflowData = null;

        if (isJson) {
            try {
                const parsed = JSON.parse(code.trim());
                if (parsed.name && parsed.nodes) {
                    isWorkflow = true;
                    workflowData = code.trim();
                }
            } catch (e) {
                // Not valid JSON, continue normally
            }
        }

        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        let codeHtml = `
            <div class="code-block" style="background: #1a1a2e; border-radius: 8px; margin: 10px 0; overflow: hidden; border: 1px solid var(--border);">
                <div class="code-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(0,0,0,0.3); border-bottom: 1px solid var(--border);">
                    <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">${language}</span>
                    <button onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)" 
                            style="background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.7rem;">
                        Copy
                    </button>
                </div>
                <pre style="margin: 0; padding: 12px; overflow-x: auto; font-size: 0.85rem;"><code style="color: #e0e0e0;">${escapedCode}</code></pre>
        `;

        // Add import button if this is a workflow
        if (isWorkflow) {
            const workflowBase64 = btoa(unescape(encodeURIComponent(workflowData)));
            codeHtml += `
                <div style="padding: 10px 12px; border-top: 1px solid var(--border); background: rgba(59, 130, 246, 0.1);">
                    <button onclick="importWorkflowFromChat('${workflowBase64}')" 
                            style="width: 100%; background: linear-gradient(135deg, #3b82f6, #2563eb); border: none; color: white; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Importar al Editor Visual
                    </button>
                </div>
            `;
        }

        codeHtml += '</div>';
        return codeHtml;
    });

    // Replace images
    html = html.replace(imgRegex, (match, alt, src) => {
        return `<div class="img-wrapper" style="margin-top: 10px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
            <img src="${src}" alt="${alt}" 
                style="width: 100%; height: auto; display: block; min-height: 200px; background: #222;"
                onload="this.style.minHeight='auto'"
                onerror="this.onerror=null; this.src='https://placehold.co/600x400/18181b/FFF?text=Error+Cargando+Imagen';">
        </div>`;
    });

    // Replace bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Replace italic *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Replace inline code `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">$1</code>');

    // Replace newlines with <br> for proper formatting
    html = html.replace(/\n/g, '<br>');

    element.innerHTML = html;
}

// Global function to import workflow from chat
window.importWorkflowFromChat = function (base64Data) {
    try {
        const jsonStr = decodeURIComponent(escape(atob(base64Data)));
        const workflow = JSON.parse(jsonStr);

        // Store in sessionStorage for the editor to pick up
        sessionStorage.setItem('pendingWorkflowImport', jsonStr);

        // Switch to workflow editor tab
        const { switchTab } = window.__chatUtils || {};
        if (typeof switchTab === 'function') {
            switchTab('workflows');
        } else {
            // Fallback: try calling directly
            document.querySelector('[onclick*="workflows"]')?.click();
        }

        // Show toast
        const { showToast } = window.__chatUtils || {};
        if (typeof showToast === 'function') {
            showToast('Workflow listo para importar - Presiona el boton Import');
        }

        // Try to auto-import if editor is ready
        setTimeout(() => {
            if (window.importN8nWorkflow && sessionStorage.getItem('pendingWorkflowImport')) {
                const pendingJson = sessionStorage.getItem('pendingWorkflowImport');
                sessionStorage.removeItem('pendingWorkflowImport');
                window.importN8nWorkflow(JSON.parse(pendingJson));
                if (typeof showToast === 'function') {
                    showToast('Workflow importado exitosamente!');
                }
            }
        }, 500);

    } catch (error) {
        console.error('Error importing workflow:', error);
        alert('Error al importar el workflow: ' + error.message);
    }
};

