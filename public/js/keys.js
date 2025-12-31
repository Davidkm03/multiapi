async function loadKeys() {
    try {
        const response = await fetch('/api/keys');
        const keys = await response.json();

        const container = document.getElementById('keys-list');
        container.innerHTML = '';

        if (keys.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No tienes llaves de API creadas.</p>
                </div>
            `;
            return;
        }

        keys.forEach(key => {
            const keyEl = document.createElement('div');
            keyEl.className = 'api-key-item';
            keyEl.innerHTML = `
                <div class="key-info">
                    <div class="key-name">${key.name}</div>
                    <div class="key-value">
                        <code>${key.key}</code>
                        <button onclick="copyToClipboard('${key.key}')" class="icon-btn" title="Copiar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                    <div class="key-meta">
                        Creada: ${new Date(key.created_at).toLocaleDateString()}
                        ${key.last_used_at ? `| Último uso: ${new Date(key.last_used_at).toLocaleDateString()}` : ''}
                        | Usos: ${key.usage_count}
                    </div>
                </div>
                <button onclick="deleteKey(${key.id})" class="delete-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            container.appendChild(keyEl);
        });
    } catch (error) {
        console.error('Error loading keys:', error);
        showToast('Error cargando llaves', 'error');
    }
}

async function createNewKey() {
    const nameInput = document.getElementById('new-key-name');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Por favor ingresa un nombre para la llave', 'error');
        return;
    }

    try {
        const response = await fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            nameInput.value = '';
            showToast('Llave API creada correctamente', 'success');
            loadKeys();
        } else {
            showToast('Error creando la llave', 'error');
        }
    } catch (error) {
        console.error('Error creating key:', error);
        showToast('Error de conexión', 'error');
    }
}

async function deleteKey(id) {
    if (!confirm('¿Estás seguro de eliminar esta llave? Cualquier sistema que la use dejará de funcionar.')) return;

    try {
        const response = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Llave eliminada', 'success');
            loadKeys();
        } else {
            showToast('Error eliminando llave', 'error');
        }
    } catch (error) {
        console.error('Error deleting key:', error);
    }
}

// Expose globally
window.loadKeys = loadKeys;
window.createNewKey = createNewKey;
window.deleteKey = deleteKey;
