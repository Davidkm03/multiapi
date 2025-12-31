import { showToast } from './utils.js';

let editor = null;
let currentZoom = 1;

export function initWorkflowEditor() {
    const container = document.getElementById('drawflow');
    if (!container) return;

    // Initialize Drawflow
    editor = new Drawflow(container);
    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.force_first_input = false;

    // IMPORTANT: Enable edit mode so inputs are interactive
    editor.editor_mode = 'edit'; // 'edit' allows editing, 'fixed' locks nodes

    editor.start();

    // Register custom node types
    registerNodeTypes();

    // Setup drag & drop from palette
    setupDragDrop();

    // Setup zoom controls
    setupZoomControls();

    // Setup node editing events
    setupNodeEditing();

    // Add initial trigger node
    addTriggerNode();

    console.log('[Editor] Workflow Editor initialized');
}

function registerNodeTypes() {
    // Templates are added dynamically when dragging
}

// Track currently selected node
let selectedNodeId = null;

// Setup event listeners for the properties panel (n8n style)
function setupNodeEditing() {
    const container = document.getElementById('drawflow');

    // Listen for node selection -> open properties panel
    editor.on('nodeSelected', (nodeId) => {
        console.log('[Editor] Node selected:', nodeId);
        selectedNodeId = nodeId;
        openPropertiesPanel(nodeId);
    });

    // Listen for click on canvas background -> close panel
    editor.on('click', () => {
        // Close panel when clicking empty space
        if (!selectedNodeId) {
            closePropertiesPanel();
        }
    });

    // Listen for node unselect
    editor.on('nodeUnselected', () => {
        // Don't close panel immediately - let user edit
    });

    // Listen for node removal
    editor.on('nodeRemoved', (nodeId) => {
        console.log('[Editor] Node removed:', nodeId);
        if (selectedNodeId === String(nodeId)) {
            closePropertiesPanel();
        }
    });
}

// Open the properties panel for a node
function openPropertiesPanel(nodeId) {
    const panel = document.getElementById('properties-panel');
    const titleEl = document.getElementById('props-node-name');
    const bodyEl = document.getElementById('props-body');

    if (!panel || !editor) return;

    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData) return;

    // Get node name from the HTML or data
    const nodeName = nodeData.data._nodeName || nodeData.name || 'Node';
    const nodeType = nodeData.data._n8nType || nodeData.class || 'unknown';

    titleEl.textContent = nodeName;

    // Build properties form based on node data
    let formHtml = '';
    const data = nodeData.data || {};

    // Standard fields based on node class
    const nodeClass = nodeData.class || data._nodeClass || 'http';

    if (nodeClass === 'trigger' || nodeType.includes('webhook')) {
        formHtml += buildPropField('path', 'Webhook Path', data.path || '', 'text', '/your-webhook');
        formHtml += buildPropSelect('method', 'HTTP Method', data.method || 'POST', ['GET', 'POST', 'PUT', 'DELETE']);
    } else if (nodeClass === 'http' || nodeType.includes('httpRequest')) {
        formHtml += buildPropField('url', 'URL', data.url || '', 'text', 'https://api.example.com');
        formHtml += buildPropSelect('method', 'Method', data.method || 'GET', ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    } else if (nodeClass === 'llm' || nodeType.includes('openAi')) {
        formHtml += buildPropField('prompt', 'Prompt', data.prompt || '', 'textarea', 'Enter your prompt...');
    } else if (nodeClass === 'image' || nodeType.includes('dalle')) {
        formHtml += buildPropField('image-prompt', 'Image Prompt', data['image-prompt'] || '', 'textarea', 'Describe the image...');
    } else if (nodeClass === 'delay' || nodeType.includes('wait')) {
        formHtml += buildPropField('delay-seconds', 'Delay (seconds)', data['delay-seconds'] || '5', 'number', '5');
    } else if (nodeType.includes('email')) {
        formHtml += buildPropField('to', 'To Email', data.to || '', 'text', 'email@example.com');
        formHtml += buildPropField('subject', 'Subject', data.subject || '', 'text', 'Email subject');
    } else if (nodeType.includes('postgres') || nodeType.includes('database')) {
        formHtml += buildPropSelect('operation', 'Operation', data.operation || 'select', ['select', 'insert', 'update', 'delete']);
        formHtml += buildPropField('table', 'Table', data.table || '', 'text', 'table_name');
    } else if (nodeType.includes('.if') || nodeType.includes('condition')) {
        formHtml += buildPropField('condition', 'Condition', data.condition || '', 'text', 'value == true');
    } else if (nodeType.includes('.code')) {
        formHtml += buildPropField('code', 'JavaScript Code', data.code || '', 'textarea', '// Your code here');
    } else {
        // Generic: Show all data keys as editable
        Object.keys(data).forEach(key => {
            if (!key.startsWith('_')) {
                const val = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
                formHtml += buildPropField(key, key, val || '', 'text', '');
            }
        });
    }

    // Add note field for all nodes
    formHtml += buildPropField('note', 'Notes', data.note || '', 'textarea', 'Add notes about this node...');

    bodyEl.innerHTML = formHtml;

    // Bind input events to sync back to node data
    bodyEl.querySelectorAll('input, textarea, select').forEach(input => {
        input.addEventListener('input', () => {
            const key = input.dataset.key;
            if (key && selectedNodeId) {
                const nd = editor.getNodeFromId(selectedNodeId);
                if (nd) {
                    nd.data[key] = input.value;
                    editor.updateNodeDataFromId(selectedNodeId, nd.data);
                }
            }
        });
    });

    panel.classList.remove('hidden');
}

// Build a property input field
function buildPropField(key, label, value, type = 'text', placeholder = '') {
    const escapedValue = String(value || '').replace(/"/g, '&quot;');
    if (type === 'textarea') {
        return `
            <div class="prop-group">
                <label class="prop-label">${label}</label>
                <textarea data-key="${key}" placeholder="${placeholder}">${escapedValue}</textarea>
            </div>
        `;
    }
    return `
        <div class="prop-group">
            <label class="prop-label">${label}</label>
            <input type="${type}" data-key="${key}" value="${escapedValue}" placeholder="${placeholder}">
        </div>
    `;
}

// Build a property select field
function buildPropSelect(key, label, value, options) {
    const optionsHtml = options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('');
    return `
        <div class="prop-group">
            <label class="prop-label">${label}</label>
            <select data-key="${key}">${optionsHtml}</select>
        </div>
    `;
}

// Close the properties panel
window.closePropertiesPanel = function () {
    const panel = document.getElementById('properties-panel');
    if (panel) panel.classList.add('hidden');
    selectedNodeId = null;
};

// Delete the selected node
window.deleteSelectedNode = function () {
    if (selectedNodeId && editor) {
        editor.removeNodeId('node-' + selectedNodeId);
        closePropertiesPanel();
        showToast('Node deleted');
    }
};


function setupDragDrop() {
    const paletteNodes = document.querySelectorAll('.palette-node');
    const canvas = document.getElementById('drawflow');

    paletteNodes.forEach(node => {
        node.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('nodeType', node.dataset.nodeType);
        });
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        if (nodeType) {
            addNode(nodeType, e.clientX, e.clientY);
        }
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
}

function addNode(type, posX, posY) {
    // Convert screen coords to editor coords
    const canvasRect = document.getElementById('drawflow').getBoundingClientRect();
    const x = (posX - canvasRect.left) / currentZoom;
    const y = (posY - canvasRect.top) / currentZoom;

    let html = '';
    let inputs = 1;
    let outputs = 1;

    switch (type) {
        case 'trigger':
            html = getTriggerNodeHTML();
            inputs = 0;
            outputs = 1;
            break;
        case 'llm':
            html = getLLMNodeHTML();
            break;
        case 'image':
            html = getImageNodeHTML();
            break;
        case 'http':
            html = getHTTPNodeHTML();
            break;
        case 'delay':
            html = getDelayNodeHTML();
            break;
        default:
            console.warn('Unknown node type:', type);
            return;
    }

    editor.addNode(
        type,           // name
        inputs,         // inputs
        outputs,        // outputs
        x,              // pos_x
        y,              // pos_y
        type,           // class
        {},             // data
        html            // html
    );
}

function addTriggerNode() {
    const html = getTriggerNodeHTML();
    editor.addNode('trigger', 0, 1, 100, 200, 'trigger', {}, html);
}

// --- Node HTML Templates ---

function getTriggerNodeHTML() {
    return `
        <div class="node-content">
            <div class="node-header">
                <div class="icon" style="background: linear-gradient(135deg, #3b82f6, #60a5fa);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </div>
                <span class="title">Trigger</span>
            </div>
            <div class="node-body">
                <label>Tipo</label>
                <select df-trigger-type>
                    <option value="manual">Manual</option>
                    <option value="webhook">Webhook</option>
                    <option value="schedule">Programado</option>
                </select>
            </div>
        </div>
    `;
}

function getLLMNodeHTML() {
    return `
        <div class="node-content">
            <div class="node-header">
                <div class="icon" style="background: linear-gradient(135deg, #8b5cf6, #6366f1);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path><path d="M16 14v2a4 4 0 0 1-8 0v-2"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg>
                </div>
                <span class="title">LLM (AI)</span>
            </div>
            <div class="node-body">
                <label>Prompt</label>
                <textarea df-prompt placeholder="Enter prompt for the AI..."></textarea>
            </div>
        </div>
    `;
}

function getImageNodeHTML() {
    return `
        <div class="node-content">
            <div class="node-header">
                <div class="icon" style="background: linear-gradient(135deg, #ec4899, #f472b6);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                </div>
                <span class="title">Image Gen</span>
            </div>
            <div class="node-body">
                <label>Visual Prompt</label>
                <textarea df-image-prompt placeholder="Describe the image to generate..."></textarea>
            </div>
        </div>
    `;
}

function getHTTPNodeHTML() {
    return `
        <div class="node-content">
            <div class="node-header">
                <div class="icon" style="background: linear-gradient(135deg, #22c55e, #4ade80);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                </div>
                <span class="title">HTTP Request</span>
            </div>
            <div class="node-body">
                <label>URL</label>
                <input type="text" df-url placeholder="https://api.example.com/webhook">
                <label style="margin-top: 0.5rem;">Method</label>
                <select df-method>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                </select>
            </div>
        </div>
    `;
}

function getDelayNodeHTML() {
    return `
        <div class="node-content">
            <div class="node-header">
                <div class="icon" style="background: linear-gradient(135deg, #f59e0b, #fbbf24);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <span class="title">Delay</span>
            </div>
            <div class="node-body">
                <label>Seconds</label>
                <input type="number" df-delay-seconds value="5" min="1" max="300">
            </div>
        </div>
    `;
}

// --- Zoom Controls ---
function setupZoomControls() {
    window.zoomIn = function () {
        currentZoom = Math.min(currentZoom + 0.1, 2);
        editor.zoom_in();
        updateZoomDisplay();
    };

    window.zoomOut = function () {
        currentZoom = Math.max(currentZoom - 0.1, 0.5);
        editor.zoom_out();
        updateZoomDisplay();
    };

    window.zoomReset = function () {
        currentZoom = 1;
        editor.zoom_reset();
        updateZoomDisplay();
    };
}

function updateZoomDisplay() {
    const display = document.getElementById('zoom-level');
    if (display) display.textContent = Math.round(currentZoom * 100) + '%';
}

// --- Export & Save ---
window.saveWorkflow = async function () {
    const nameInput = document.getElementById('workflow-name');
    const name = nameInput ? nameInput.value.trim() : 'Untitled Workflow';

    if (!name) {
        showToast('Dale un nombre al workflow', 'error');
        return;
    }

    const exportData = editor.export();
    const steps = convertDrawflowToSteps(exportData);

    if (steps.length === 0) {
        showToast('Añade al menos un nodo al flujo', 'error');
        return;
    }

    try {
        const res = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                description: `Creado visualmente (${steps.length} pasos)`,
                steps: steps
            })
        });

        if (res.ok) {
            const data = await res.json();
            showToast('Workflow saved! ID: ' + data.id);
        } else {
            throw new Error('Error al guardar');
        }
    } catch (err) {
        showToast('Error guardando workflow', 'error');
        console.error(err);
    }
};

window.executeWorkflow = async function () {
    const exportData = editor.export();
    const steps = convertDrawflowToSteps(exportData);

    if (steps.length === 0) {
        showToast('Añade nodos al flujo primero', 'error');
        return;
    }

    showToast('Executing workflow...');

    try {
        // We'll execute directly without saving first
        const res = await fetch('/api/workflows/execute-direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steps: steps, input: 'Visual Editor Trigger' })
        });

        const data = await res.json();

        if (data.success) {
            showResultModal(data.output);
            showToast('Execution completed');
        } else {
            showResultModal('Error:\n' + JSON.stringify(data.error, null, 2), true);
        }
    } catch (err) {
        showToast('Error ejecutando', 'error');
        console.error(err);
    }
};

// --- Conversion Logic ---
function convertDrawflowToSteps(drawflowData) {
    const steps = [];
    const module = drawflowData.drawflow?.Home?.data || {};

    // Sort nodes by connections to determine execution order
    const nodeOrder = getExecutionOrder(module);

    nodeOrder.forEach(nodeId => {
        const node = module[nodeId];
        if (!node) return;

        const step = convertNodeToStep(node);
        if (step) steps.push(step);
    });

    return steps;
}

function getExecutionOrder(nodes) {
    // Simple topological sort based on connections
    const order = [];
    const visited = new Set();

    // Start from trigger nodes (no inputs)
    Object.keys(nodes).forEach(id => {
        const node = nodes[id];
        if (node.name === 'trigger' || Object.keys(node.inputs).every(k => !node.inputs[k].connections.length)) {
            traverseNode(id, nodes, visited, order);
        }
    });

    // Add any remaining nodes
    Object.keys(nodes).forEach(id => {
        if (!visited.has(id)) {
            traverseNode(id, nodes, visited, order);
        }
    });

    return order;
}

function traverseNode(id, nodes, visited, order) {
    if (visited.has(id)) return;
    visited.add(id);

    const node = nodes[id];
    if (!node) return;

    // Include all nodes - let convertNodeToStep handle filtering
    order.push(id);

    // Follow outputs
    Object.keys(node.outputs).forEach(outputKey => {
        const connections = node.outputs[outputKey].connections;
        connections.forEach(conn => {
            traverseNode(conn.node, nodes, visited, order);
        });
    });
}

function convertNodeToStep(node) {
    const data = node.data || {};
    const nodeClass = data._nodeClass || node.name || 'unknown';
    const n8nType = data._n8nType || '';

    // Handle trigger nodes - they start the flow but don't execute as steps
    if (nodeClass === 'trigger' || node.name === 'trigger' ||
        n8nType.includes('Trigger') || n8nType.includes('manualTrigger')) {
        return {
            type: 'trigger',
            name: data._nodeName || 'Trigger'
        };
    }

    // Code nodes - execute JavaScript
    if (nodeClass === 'code' || n8nType.includes('.code') || n8nType.includes('function')) {
        return {
            type: 'code',
            jsCode: data.jsCode || data.code || '',
            name: data._nodeName || 'Code'
        };
    }

    // HTTP Request nodes
    if (nodeClass === 'http' || node.name === 'http' ||
        n8nType.includes('httpRequest') || n8nType.includes('Http')) {
        return {
            type: 'http_request',
            url: data.url || '',
            method: data.method || 'GET',
            body: data.body || '',
            name: data._nodeName || 'HTTP Request'
        };
    }

    // LLM nodes
    if (nodeClass === 'llm' || node.name === 'llm' ||
        n8nType.includes('openAi') || n8nType.includes('llm')) {
        return {
            type: 'llm',
            prompt: data.prompt || 'Default prompt',
            name: data._nodeName || 'LLM'
        };
    }

    // Image generation
    if (nodeClass === 'image' || node.name === 'image' ||
        n8nType.includes('dalle') || n8nType.includes('image')) {
        return {
            type: 'image',
            prompt: data['image-prompt'] || data.prompt || 'A beautiful landscape',
            name: data._nodeName || 'Image'
        };
    }

    // Delay/Wait nodes
    if (nodeClass === 'delay' || node.name === 'delay' ||
        n8nType.includes('wait') || n8nType.includes('delay')) {
        return {
            type: 'delay',
            seconds: parseInt(data['delay-seconds'] || data.seconds || data.value) || 5,
            name: data._nodeName || 'Delay'
        };
    }

    // Condition/IF nodes - currently just pass through
    if (nodeClass === 'condition' || n8nType.includes('.if') || n8nType.includes('switch')) {
        console.warn('[Convert] Condition nodes not fully supported, passing through');
        return {
            type: 'trigger', // Treat as passthrough for now
            name: data._nodeName || 'Condition'
        };
    }

    // Email nodes - log warning but include
    if (nodeClass === 'email' || n8nType.includes('email')) {
        console.warn('[Convert] Email nodes require configuration');
        return {
            type: 'trigger', // Placeholder
            name: data._nodeName || 'Email'
        };
    }

    // Database nodes - log warning
    if (nodeClass === 'database' || n8nType.includes('postgres') || n8nType.includes('mysql')) {
        console.warn('[Convert] Database nodes require backend configuration');
        return {
            type: 'trigger', // Placeholder
            name: data._nodeName || 'Database'
        };
    }

    // Response nodes - mark completion
    if (nodeClass === 'response' || n8nType.includes('respondToWebhook')) {
        return {
            type: 'trigger', // Passthrough - response is the final output
            name: data._nodeName || 'Response'
        };
    }

    // For any other node type, try to extract useful data
    if (data.url) {
        return {
            type: 'http_request',
            url: data.url,
            method: data.method || 'GET',
            name: data._nodeName || 'HTTP'
        };
    }

    if (data.jsCode || data.code) {
        return {
            type: 'code',
            jsCode: data.jsCode || data.code,
            name: data._nodeName || 'Code'
        };
    }

    // Unknown nodes - skip but log
    console.warn(`[Convert] Unknown node type: ${nodeClass} / ${n8nType}`);
    return null;
}

// Helper to show results (reuse from workflows.js or define here)
function showResultModal(content, isError = false) {
    const modal = document.getElementById('workflow-result-overlay');
    const container = document.getElementById('workflow-result-content');
    if (!modal || !container) {
        console.log('Result:', content);
        alert(isError ? 'Error: ' + content : 'Resultado: ' + content);
        return;
    }

    if (typeof content === 'object') {
        container.textContent = JSON.stringify(content, null, 2);
    } else {
        const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
        if (typeof content === 'string' && content.match(imgRegex)) {
            container.innerHTML = content.replace(imgRegex, (m, alt, src) =>
                `<img src="${src}" alt="${alt}" style="max-width:100%; border-radius: 8px; margin: 10px 0;">`
            );
        } else {
            container.textContent = content;
        }
    }

    container.style.color = isError ? '#ef4444' : 'var(--text-main)';
    modal.classList.add('active');
}

// --- Import Modal Logic ---
window.openImportModal = function () {
    const modal = document.getElementById('import-modal-overlay');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('import-json-input').value = '';
        document.getElementById('import-json-input').focus();
    }
};

window.closeImportModal = function () {
    const modal = document.getElementById('import-modal-overlay');
    if (modal) modal.classList.remove('active');
};

window.closeResultModal = function () {
    const modal = document.getElementById('workflow-result-overlay');
    if (modal) modal.classList.remove('active');
};

window.clearCanvas = function () {
    if (!editor) return;
    if (!confirm('¿Limpiar todo el canvas? Se perderán los nodos actuales.')) return;
    editor.clear();
    showToast('Canvas limpiado');
};

window.importWorkflow = function () {
    const input = document.getElementById('import-json-input');
    const jsonStr = input ? input.value.trim() : '';

    if (!jsonStr) {
        showToast('Pega un JSON válido', 'error');
        return;
    }

    try {
        const workflow = JSON.parse(jsonStr);
        window.importN8nWorkflow(workflow);
        closeImportModal();
        showToast('Workflow imported successfully');
    } catch (err) {
        console.error('Import error:', err);
        showToast('JSON inválido: ' + err.message, 'error');
    }
};

// Expose to window for chat integration
window.importN8nWorkflow = function (workflow) {
    console.log('[Import] Starting import:', workflow);

    if (!editor) {
        console.error('[Import] Editor not initialized');
        showToast('Editor no inicializado', 'error');
        return;
    }

    // Clear existing canvas
    editor.clear();

    // Set workflow name if available
    const nameInput = document.getElementById('workflow-name');
    if (nameInput && workflow.name) {
        nameInput.value = workflow.name;
    }

    // Map to store n8n node names to Drawflow node IDs  
    const nodeIdMap = {};

    // Parse nodes
    const nodes = workflow.nodes || [];
    console.log('[Import] Processing', nodes.length, 'nodes');

    if (nodes.length === 0) {
        console.warn('[Import] No nodes found in workflow');
        showToast('Workflow vacío - sin nodos', 'error');
        return;
    }

    nodes.forEach((n8nNode, index) => {
        console.log('[Import] Node:', n8nNode.name, n8nNode.type);

        const mappedNode = mapN8nNodeType(n8nNode);
        if (!mappedNode) {
            console.warn(`[Import] Skipping unsupported node type: ${n8nNode.type}`);
            return;
        }

        // Position from n8n or calculate based on index (centered in viewport)
        const posX = n8nNode.position?.[0] || (200 + index * 250);
        const posY = n8nNode.position?.[1] || 250;

        try {
            const nodeId = editor.addNode(
                mappedNode.type,
                mappedNode.inputs,
                mappedNode.outputs,
                posX,
                posY,
                mappedNode.type,
                mappedNode.data,
                mappedNode.html
            );

            // Map original name to new Drawflow ID
            nodeIdMap[n8nNode.name] = nodeId;
            console.log('[Import] Added node:', n8nNode.name, '-> ID:', nodeId);

            // Check for missing configuration (placeholders)
            // Use the RAW node data to find nested parameters
            const rawNodeStr = JSON.stringify(n8nNode);
            const needsConfig =
                rawNodeStr.includes('YOUR_') ||
                rawNodeStr.includes('INSERT_') ||
                rawNodeStr.includes('ENTER_') ||
                rawNodeStr.includes('<API_KEY>') ||
                rawNodeStr.includes('dummy-key');

            if (needsConfig) {
                setTimeout(() => {
                    const nodeEl = document.getElementById('node-' + nodeId);
                    if (nodeEl) {
                        nodeEl.classList.add('needs-config');
                    }
                }, 300);
            }
        } catch (err) {
            console.error('[Import] Error adding node:', err);
        }
    });

    // Parse connections
    const connections = workflow.connections || {};
    console.log('[Import] Processing connections');

    Object.entries(connections).forEach(([sourceName, outputs]) => {
        const sourceId = nodeIdMap[sourceName];
        if (!sourceId) {
            console.warn('[Import] Source not found:', sourceName);
            return;
        }

        outputs.main?.forEach((targets, outputIndex) => {
            targets?.forEach(target => {
                const targetId = nodeIdMap[target.node];
                if (!targetId) {
                    console.warn('[Import] Target not found:', target.node);
                    return;
                }

                try {
                    editor.addConnection(
                        sourceId,
                        targetId,
                        `output_${outputIndex + 1}`,
                        `input_${(target.index || 0) + 1}`
                    );
                    console.log('[Import] Connected:', sourceName, '->', target.node);
                } catch (e) {
                    console.warn('[Import] Connection error:', e);
                }
            });
        });
    });

    console.log('[Import] Imported workflow:', workflow.name, `(${nodes.length} nodes)`);

    // Check for warnings and notify user
    setTimeout(() => {
        const warnings = document.querySelectorAll('.drawflow-node.needs-config');
        if (warnings.length > 0) {
            showToast(`⚠️ ${warnings.length} nodos requieren configuración de credenciales`, 'error');
        } else {
            showToast('Workflow importado correctamente', 'success');
        }
    }, 500);

    // Reset zoom to 100% and scroll to show nodes
    if (typeof currentZoom !== 'undefined') {
        currentZoom = 1;
        editor.zoom = 1;
        editor.zoom_refresh();
    }

    // Try to center the view on the first node
    setTimeout(() => {
        const canvas = document.querySelector('#drawflow .drawflow');
        if (canvas) {
            canvas.style.transform = 'translate(0px, 0px) scale(1)';
        }
    }, 100);
};

function mapN8nNodeType(n8nNode) {
    const type = n8nNode.type || '';
    const params = n8nNode.parameters || {};
    const name = n8nNode.name || 'Node';

    // SVG icon templates
    const svgIcons = {
        trigger: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
        webhook: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M18 16.98h-5.99c-1.1 0-1.95.68-2.95 1.76"></path><path d="M7 21c3.5-1 6.5-3.5 8-7"></path><circle cx="12" cy="12" r="10"></circle></svg>',
        rss: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle></svg>',
        message: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
        globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
        generic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
        email: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
        database: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>',
        file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
        code: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
        condition: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>',
        response: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>',
        timer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    };

    // Helper to escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    // Clean n8n expression syntax (remove = prefix)
    function cleanValue(val) {
        if (!val) return '';
        return String(val).replace(/^=/, '');
    }

    // Create compact n8n-style node (icon + title only)
    // Data is stored for the properties panel
    function createCompactNode(opts) {
        const { iconSvg, color, label, inputs = 1, outputs = 1, subtitle = '', nodeClass = 'http' } = opts;

        // Store all original n8n params for the properties panel
        const nodeData = {
            _nodeName: label,
            _n8nType: type,
            _nodeClass: nodeClass,
            ...params
        };

        // Clean up expression values
        Object.keys(nodeData).forEach(k => {
            if (typeof nodeData[k] === 'string') {
                nodeData[k] = cleanValue(nodeData[k]);
            }
        });

        return {
            type: nodeClass,
            inputs,
            outputs,
            data: nodeData,
            html: `
                <div class="node-content">
                    <div class="node-header">
                        <div class="icon" style="background: ${color};">${iconSvg}</div>
                        <span class="title">${escapeHtml(label)}</span>
                    </div>
                    ${subtitle ? `<div class="node-body">${escapeHtml(subtitle)}</div>` : ''}
                </div>
            `
        };
    }

    // --- WEBHOOK TRIGGER ---
    if (type.includes('webhook')) {
        return createCompactNode({
            iconSvg: svgIcons.webhook,
            color: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
            label: name,
            inputs: 0,
            outputs: 1,
            subtitle: `/${params.path || 'webhook'}`,
            nodeClass: 'trigger'
        });
    }

    // --- SCHEDULE TRIGGER ---
    if (type.includes('scheduleTrigger') || type.includes('cron')) {
        return createCompactNode({
            iconSvg: svgIcons.timer,
            color: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
            label: name,
            inputs: 0,
            outputs: 1,
            subtitle: 'Scheduled',
            nodeClass: 'trigger'
        });
    }

    // --- GENERIC TRIGGER ---
    if (type.includes('Trigger')) {
        return createCompactNode({
            iconSvg: svgIcons.trigger,
            color: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
            label: name,
            inputs: 0,
            outputs: 1,
            nodeClass: 'trigger'
        });
    }

    // --- HTTP REQUEST ---
    if (type.includes('httpRequest') || type.includes('Http')) {
        const method = params.method || 'GET';
        return createCompactNode({
            iconSvg: svgIcons.globe,
            color: 'linear-gradient(135deg, #22c55e, #4ade80)',
            label: name,
            subtitle: method,
            nodeClass: 'http'
        });
    }

    // --- CONDITION / IF ---
    if (type.includes('.if') || type.includes('switch') || type.includes('filter')) {
        return createCompactNode({
            iconSvg: svgIcons.condition,
            color: 'linear-gradient(135deg, #f59e0b, #d97706)',
            label: name,
            outputs: 2,
            subtitle: 'True / False',
            nodeClass: 'condition'
        });
    }

    // --- CODE / FUNCTION ---
    if (type.includes('.code') || type.includes('function') || type.includes('javascript')) {
        return createCompactNode({
            iconSvg: svgIcons.code,
            color: 'linear-gradient(135deg, #ec4899, #be185d)',
            label: name,
            subtitle: 'JavaScript',
            nodeClass: 'code'
        });
    }

    // --- EMAIL ---
    if (type.includes('emailSend') || type.includes('email') || type.includes('smtp')) {
        return createCompactNode({
            iconSvg: svgIcons.email,
            color: 'linear-gradient(135deg, #06b6d4, #0891b2)',
            label: name,
            subtitle: params.toEmail ? cleanValue(params.toEmail).substring(0, 20) : 'Send Email',
            nodeClass: 'email'
        });
    }

    // --- DATABASE (Postgres, MySQL, etc) ---
    if (type.includes('postgres') || type.includes('mysql') || type.includes('mongodb') || type.includes('redis')) {
        return createCompactNode({
            iconSvg: svgIcons.database,
            color: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            label: name,
            subtitle: params.operation || 'Query',
            nodeClass: 'database'
        });
    }

    // --- RESPOND TO WEBHOOK ---
    if (type.includes('respondToWebhook') || type.includes('response')) {
        return createCompactNode({
            iconSvg: svgIcons.response,
            color: 'linear-gradient(135deg, #10b981, #059669)',
            label: name,
            outputs: 0,
            subtitle: params.respondWith || 'JSON',
            nodeClass: 'response'
        });
    }

    // --- RSS FEED ---
    if (type.includes('rssFeedRead') || type.includes('rss')) {
        return createCompactNode({
            iconSvg: svgIcons.rss,
            color: 'linear-gradient(135deg, #f97316, #fb923c)',
            label: name,
            subtitle: 'RSS Feed',
            nodeClass: 'http'
        });
    }

    // --- MESSAGING (Slack, Discord, Telegram) ---
    if (type.includes('slack') || type.includes('discord') || type.includes('telegram')) {
        return createCompactNode({
            iconSvg: svgIcons.message,
            color: 'linear-gradient(135deg, #22c55e, #16a34a)',
            label: name,
            subtitle: params.channel || 'Message',
            nodeClass: 'message'
        });
    }

    // --- AI / LLM ---
    if (type.includes('openAi') || type.includes('gpt') || type.includes('llm') || type.includes('anthropic')) {
        return createCompactNode({
            iconSvg: svgIcons.generic,
            color: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            label: name,
            subtitle: 'AI / LLM',
            nodeClass: 'llm'
        });
    }

    // --- IMAGE GENERATION ---
    if (type.includes('dalle') || type.includes('image') || type.includes('Image')) {
        return createCompactNode({
            iconSvg: svgIcons.file,
            color: 'linear-gradient(135deg, #ec4899, #f472b6)',
            label: name,
            subtitle: 'Image',
            nodeClass: 'image'
        });
    }

    // --- DELAY / WAIT ---
    if (type.includes('wait') || type.includes('delay') || type.includes('Wait')) {
        return createCompactNode({
            iconSvg: svgIcons.timer,
            color: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            label: name,
            subtitle: `${params.seconds || params.value || 5}s`,
            nodeClass: 'delay'
        });
    }

    // --- FALLBACK: Generic compact node ---
    let iconSvg = svgIcons.generic;
    let color = 'linear-gradient(135deg, #6b7280, #4b5563)';

    if (type.toLowerCase().includes('email')) { iconSvg = svgIcons.email; color = 'linear-gradient(135deg, #06b6d4, #0891b2)'; }
    if (type.toLowerCase().includes('database') || type.toLowerCase().includes('sql')) { iconSvg = svgIcons.database; color = 'linear-gradient(135deg, #0ea5e9, #0284c7)'; }
    if (type.toLowerCase().includes('file')) { iconSvg = svgIcons.file; color = 'linear-gradient(135deg, #f59e0b, #d97706)'; }
    if (type.toLowerCase().includes('code')) { iconSvg = svgIcons.code; color = 'linear-gradient(135deg, #ec4899, #be185d)'; }

    // Get a short type name for subtitle
    const shortType = type.split('.').pop()?.replace('n8n-nodes-base.', '') || '';

    return createCompactNode({
        iconSvg,
        color,
        label: name,
        subtitle: shortType,
        nodeClass: 'http'
    });
}


