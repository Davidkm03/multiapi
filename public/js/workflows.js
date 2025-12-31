import { showToast } from './utils.js';

export async function fetchWorkflows() {
    const listEl = document.getElementById('workflows-list');
    if (!listEl) return;

    try {
        const res = await fetch('/api/workflows');
        if (!res.ok) throw new Error('Failed to load');

        const flows = await res.json();
        renderWorkflows(flows);
    } catch (err) {
        listEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Error cargando automatizaciones.</div>';
    }
}

function renderWorkflows(flows) {
    const listEl = document.getElementById('workflows-list');
    if (!listEl) return;

    if (flows.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 3rem; background: var(--bg-panel); border: 1px dashed var(--border); border-radius: var(--radius-lg);">
                <div style="font-size: 2rem; margin-bottom: 1rem;">-</div>
                <h3 style="margin-bottom: 0.5rem; color: var(--text-main);">No automations yet</h3>
                <p style="color: var(--text-muted); max-width: 400px; margin: 0 auto;">
                    Usa el Chat en modo "Agente" y pídele que cree una automatización para ti.
                    <br><br>
                    <i>Ej: "Crea una automatización que genere una noticia diaria y cree una imagen."</i>
                </p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = flows.map(flow => `
        <div class="key-item" style="flex-direction: column; align-items: stretch; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div class="key-info">
                    <h3 style="font-size: 1.1rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
                    > ${flow.name}
                    </h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.25rem;">
                        ${flow.description || 'No description'}
                    </p>
                </div>
                <button class="primary-btn" onclick="runWorkflow(${flow.id})" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                    Run
                </button>
            </div>

            <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: var(--radius-md);">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 600;">Flow Steps:</div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${flow.steps.map((step, idx) => `
                        <div style="background: var(--bg-element); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                            <span style="color: var(--text-muted);">${idx + 1}.</span>
                            ${getStepIcon(step.type)} 
                            <span style="font-weight: 500;">${step.type.toUpperCase()}</span>
                        </div>
                        ${idx < flow.steps.length - 1 ? '<span style="color: var(--border);">→</span>' : ''}
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

function getStepIcon(type) {
    switch (type) {
        case 'llm': return '[AI]';
        case 'image': return '[IMG]';
        case 'http_request': return '[HTTP]';
        case 'delay': return '[WAIT]';
        default: return '[*]';
    }
}

// --- Modal Logic ---
window.closeResultModal = function () {
    const modal = document.getElementById('workflow-result-overlay');
    if (modal) modal.classList.remove('active');
};

function showResultModal(content, isError = false) {
    const modal = document.getElementById('workflow-result-overlay');
    const container = document.getElementById('workflow-result-content');

    if (!modal || !container) return;

    // Smart Rendering
    if (typeof content === 'object') {
        container.textContent = JSON.stringify(content, null, 2);
    } else {
        // Check for markdown images in text
        const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
        if (typeof content === 'string' && content.match(imgRegex)) {
            const html = content.replace(imgRegex, (match, alt, src) => {
                return `<div style="margin: 10px 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
                    <img src="${src}" alt="${alt}" style="max-width: 100%; display: block;">
                </div>`;
            });
            // Si hay texto + imagen, usamos innerHTML
            container.innerHTML = html.replace(/\n/g, '<br>');
        } else {
            container.textContent = content;
        }
    }

    if (isError) container.style.color = '#ef4444';
    else container.style.color = 'var(--text-main)';

    modal.classList.add('active');
}

window.runWorkflow = async function (id) {
    // UI Feedback immediate
    const btn = event.target; // Capture button if possible
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading...';
    }

    showToast('Executing...', 'info');

    try {
        const res = await fetch(`/api/workflows/${id}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: "Manual Trigger via Dashboard" })
        });

        const data = await res.json();

        if (data.success) {
            console.log('Output:', data.output);
            showResultModal(data.output);
            showToast('Workflow completed');
        } else {
            showResultModal('Error in workflow:\n' + JSON.stringify(data.error, null, 2), true);
            showToast('Workflow error', 'error');
        }
    } catch (err) {
        showResultModal('Error de conexión o timeout.\n' + err.message, true);
        showToast('Error de conexión', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
};
