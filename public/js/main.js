import { switchTab, showToast } from './utils.js';
import { initAuth, fetchKeys, deleteKey, verifyAuth } from './auth.js';
import { initSettings, sendMessage } from './chat.js';
import { initWorkflowEditor } from './workflow-editor.js'; // Visual Editor

let workflowEditorInitialized = false;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Init Auth (Login & Keys)
    initAuth(() => fetchKeys());

    // 2. Check Session
    verifyAuth(() => fetchKeys());

    // 3. Init Chat Settings (Modal)
    initSettings();

    // 4. Global Event Listeners (for onclick in HTML)
    // Custom Switch Tab to handle specific loads
    window.switchTab = (tabName) => {
        switchTab(tabName);
        if (tabName === 'keys') fetchKeys();
        if (tabName === 'workflows' && !workflowEditorInitialized) {
            // Initialize visual editor on first visit
            setTimeout(() => {
                initWorkflowEditor();
                workflowEditorInitialized = true;
            }, 100); // Small delay to ensure DOM is ready
        }
    };

    window.deleteKey = deleteKey;

    // Configuración específica de imagen (legacy logic adapted)
    const imageUploadInput = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreviewEl = document.getElementById('image-preview');

    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (evt) {
                if (imagePreviewEl) imagePreviewEl.src = evt.target.result;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }

    window.clearImageSelection = function () {
        if (imageUploadInput) imageUploadInput.value = '';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreviewEl) imagePreviewEl.src = '';
    };

    // Chat Form
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');

    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Otros Helpers Globales necesitados por el HTML
    window.createKey = async function () {
        const modal = document.getElementById('create-modal-overlay');
        const input = document.getElementById('new-key-name');
        if (modal) {
            modal.classList.add('active');
            setTimeout(() => input.focus(), 100);
        }
    };

    window.closeModal = function () {
        const modal = document.getElementById('create-modal-overlay');
        if (modal) modal.classList.remove('active');
    };

    window.confirmCreateKey = async function () {
        const input = document.getElementById('new-key-name');
        if (!input) return;
        const name = input.value.trim();
        if (!name) return;

        // Import dynamic to avoid circular dep or just use auth function
        const { createKey } = await import('./auth.js');
        await createKey(name);
        window.closeModal();
        input.value = '';
    };

    window.switchCode = function (lang) {
        document.querySelectorAll('.code-block').forEach(el => el.classList.remove('active'));
        document.getElementById(`code-${lang}`).classList.add('active');

        document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
        const tabs = document.querySelectorAll('.code-tab');
        tabs.forEach(t => {
            if (t.getAttribute('onclick') && t.getAttribute('onclick').includes(lang)) t.classList.add('active');
        });
    };

    window.copyToClipboard = function (text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copiado');
        });
    }
});
