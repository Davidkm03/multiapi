import type { ChatMessage } from '../types';
import { dbManager } from '../db';
import { groqService } from './groq';
import { imageService } from './images';

interface WorkflowStep {
    id: string;
    type: 'llm' | 'image' | 'http_request' | 'delay' | 'code' | 'trigger';
    params: any;
    [key: string]: any;
}

// Helper to resolve n8n-style expressions like {{ $json.field }}
function resolveExpression(template: string, context: any): string {
    if (!template || typeof template !== 'string') return template;

    // Remove leading = from n8n expressions
    let expr = template.startsWith('=') ? template.slice(1) : template;

    // Replace {{ $json.xxx }} with context values
    expr = expr.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, (match, key) => {
        return context && context[key] !== undefined ? String(context[key]) : '';
    });

    // Replace {{ $json['xxx'] }} syntax
    expr = expr.replace(/\{\{\s*\$json\[['"](\w+)['"]\]\s*\}\}/g, (match, key) => {
        return context && context[key] !== undefined ? String(context[key]) : '';
    });

    return expr;
}

// Safely execute JavaScript code in a sandboxed way
function executeCode(code: string, inputData: any): any {
    try {
        // Create a simple sandbox with $input helper
        const $input = {
            first: () => ({ json: inputData }),
            all: () => [{ json: inputData }]
        };
        const $json = inputData;

        // Execute the code
        const fn = new Function('$input', '$json', `
            ${code}
        `);

        const result = fn($input, $json);
        return result;
    } catch (error: any) {
        console.error('[Code] Execution error:', error.message);
        throw new Error(`Code execution failed: ${error.message}`);
    }
}

export const workflowEngine = {
    async execute(workflowId: number, initialContext: string = '') {
        const workflow = dbManager.getWorkflow(workflowId);
        if (!workflow) throw new Error('Workflow not found');

        console.log(`[Workflow] Starting: ${workflow.name}`);
        return this.runSteps(workflow.steps, initialContext);
    },

    async executeDirect(steps: any[], initialContext: string = '') {
        console.log(`[Workflow] Executing Direct (${steps.length} steps)`);
        return this.runSteps(steps, initialContext);
    },

    async runSteps(steps: any[], initialContext: string) {
        // Context can be a string or object depending on the step type
        let context: any = initialContext;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepType = step.type;
            console.log(`[Step ${i + 1}/${steps.length}] ${stepType}`);

            try {
                switch (stepType) {
                    case 'trigger':
                        // Triggers just pass through, they're starting points
                        console.log('[Trigger] Starting workflow');
                        break;

                    case 'code':
                        // Execute JavaScript code
                        const jsCode = step.jsCode || step.code || step.params?.jsCode || '';
                        if (!jsCode) {
                            console.warn('[Code] No code provided, skipping');
                            break;
                        }

                        console.log('[Code] Executing JavaScript...');
                        const codeInput = typeof context === 'string' ? { input: context } : context;
                        const codeResult = executeCode(jsCode, codeInput);

                        // Handle return value
                        if (codeResult !== undefined) {
                            context = codeResult;
                        }
                        console.log('[Code] Result:', JSON.stringify(context).substring(0, 100));
                        break;

                    case 'llm':
                        // LLM Processing
                        const prompt = resolveExpression(
                            step.prompt || step.params?.prompt_template || 'Hello',
                            context
                        ).replace('{{context}}', typeof context === 'string' ? context : JSON.stringify(context));

                        const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
                        let responseText = '';

                        for await (const chunk of groqService.chat(messages)) {
                            responseText += chunk;
                        }
                        context = responseText;
                        break;

                    case 'image':
                        // Image Gen
                        const imgPrompt = resolveExpression(
                            step.prompt || step.params?.prompt_template || 'A beautiful landscape',
                            context
                        ).replace('{{context}}', typeof context === 'string' ? context : JSON.stringify(context));

                        const imgMsg: ChatMessage[] = [{ role: 'user', content: imgPrompt }];
                        let imgOutput = '';

                        for await (const chunk of imageService.chat(imgMsg)) {
                            imgOutput += chunk;
                        }
                        context = imgOutput;
                        break;

                    case 'http_request':
                    case 'http':
                        // HTTP Request with dynamic URL support
                        let url = step.url || step.params?.url || '';
                        const method = step.method || step.params?.method || 'GET';

                        if (!url) {
                            console.warn('[HTTP] Missing URL, skipping');
                            break;
                        }

                        // Resolve dynamic expressions in URL
                        url = resolveExpression(url, context);

                        console.log(`[HTTP] ${method} ${url}`);

                        // Build request options
                        const requestOptions: RequestInit = { method };

                        // Only add body and Content-Type for non-GET requests
                        if (method !== 'GET') {
                            const bodyStr = step.body || step.params?.body || JSON.stringify({ data: context });
                            const body = resolveExpression(bodyStr, context);
                            requestOptions.headers = { 'Content-Type': 'application/json' };
                            requestOptions.body = body;
                        }

                        const resp = await fetch(url, requestOptions);

                        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

                        // Try to parse as JSON, fallback to text
                        const respText = await resp.text();
                        try {
                            context = JSON.parse(respText);
                        } catch {
                            context = respText;
                        }
                        console.log('[HTTP] Response received');
                        break;

                    case 'delay':
                        const seconds = step.seconds || step.params?.seconds || 5;
                        const ms = seconds * 1000;
                        console.log(`[Delay] Waiting ${seconds}s...`);
                        await new Promise(r => setTimeout(r, ms));
                        break;

                    default:
                        console.warn(`[WARN] Unsupported step type: ${stepType}, skipping`);
                }
            } catch (error) {
                console.error(`[ERROR] Step ${i + 1}:`, error);
                throw error;
            }
        }

        console.log(`[Workflow] Completed successfully.`);
        return typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    }
};

