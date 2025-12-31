// --- UI UTILITIES ---

export function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-msg').textContent = msg;
    document.getElementById('toast-icon').textContent = type === 'success' ? '[OK]' : '[!]';

    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copiado al portapapeles');
    });
}

// Expose to window for global access
window.__chatUtils = { showToast, copyToClipboard };

// Tab Switching
export function switchTab(tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Simple logic to activate correct tab button based on index or manually query
    // Optimización: Buscamos el botón que tenga el onclick correspondiente
    const btn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
}

// Update global utils with switchTab
window.__chatUtils.switchTab = switchTab;

