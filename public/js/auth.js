import { showToast } from './utils.js';

let ADMIN_SECRET = sessionStorage.getItem('admin_secret') || null;

export function getAdminSecret() {
    return ADMIN_SECRET;
}

export async function verifyAuth(onSuccess) {
    if (ADMIN_SECRET && await testAuth(ADMIN_SECRET)) {
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'none';
        if (onSuccess) onSuccess();
    } else {
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

export function initAuth(onLoginSuccess) {
    const loginForm = document.getElementById('login-form');
    const loginScreen = document.getElementById('login-screen');
    const loginError = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const info = document.getElementById('admin-password').value;

            if (await testAuth(info)) {
                ADMIN_SECRET = info;
                sessionStorage.setItem('admin_secret', info);

                loginScreen.style.opacity = '0';
                setTimeout(() => loginScreen.style.display = 'none', 300);
                if (onLoginSuccess) onLoginSuccess();
            } else {
                loginError.style.display = 'block';
                loginForm.reset();
            }
        });
    }
}

// --- KEYS MANAGEMENT ---
export async function fetchKeys() {
    if (!ADMIN_SECRET) return;

    try {
        const res = await fetch('/api/keys', {
            headers: { 'X-Admin-Secret': ADMIN_SECRET }
        });
        if (res.status === 401) {
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
    if (!listEl) return;

    if (keys.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No tienes llaves activas. Crea una para empezar.</div>';
        return;
    }

    listEl.innerHTML = keys.map(k => `
        <div class="key-item">
            <div class="key-info">
                <h3>${k.name}</h3>
                <div class="key-meta">
                    <span>Uses: ${k.usage_count}</span>
                    <span>Created: ${new Date(k.created_at).toLocaleDateString()}</span>
                </div>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <div class="key-value-blur code-copy" data-key="${k.key}" title="Click to copy">${k.key}</div>
                <button class="delete-btn" data-id="${k.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

function updatePlaygroundSelector(keys) {
    const playgroundKeySelect = document.getElementById('playground-key-select');
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

export async function createKey(name) {
    if (!name) return;
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
}

export async function deleteKey(id) {
    if (!confirm('¿Seguro que quieres borrar esta llave?')) return;
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
}
