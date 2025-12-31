
// Script para probar la creación y ejecución de una automatización
// Ejecutar con: bun run test/create_flow.ts

const API_URL = 'http://localhost:3000/api';

async function main() {
    console.log('🏗️ Creando Workflow de Prueba: "Gatos Espaciales"...');

    const workflow = {
        name: "Noticias de Gatos Espaciales",
        description: "Genera una noticia falsa y su imagen correspondiente",
        steps: [
            {
                id: "step_1",
                type: "llm",
                params: {
                    prompt_template: "Escribe un titular corto y sensacionalista sobre gatos que conquistan Marte. {{context}}"
                }
            },
            {
                id: "step_2",
                type: "image",
                params: {
                    prompt_template: "Realistic photography of a cat inside a spacesuit walking on Mars surface, high detail, 4k. {{context}}"
                }
            },
            {
                id: "step_3",
                type: "delay",
                params: { ms: 2000 }
            }
        ]
    };

    // 1. Crear
    const createRes = await fetch(`${API_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
    });

    const createData = await createRes.json();
    console.log('✅ Resultado Creación:', createData);

    if (createData.success && createData.id) {
        const id = createData.id;
        console.log(`\n🚀 Ejecutando Workflow ID #${id}...`);

        // 2. Ejecutar
        const runRes = await fetch(`${API_URL}/workflows/${id}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: "Inicio" })
        });

        const runData = await runRes.json();
        console.log('✅ Resultado Ejecución:', runData);
        console.log('\n✨ Output Final (Probablemente la imagen generada):');
        console.log(runData.output);
    }
}

main();
