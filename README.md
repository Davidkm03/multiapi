# Bun AI Proxy API

Una API REST inteligente construida con Bun que actúa como proxy para múltiples servicios de IA gratuitos, implementando rotación automática y streaming en tiempo real.

## Características Principales

*   **Rotación Inteligente (Round-Robin)**: Distribuye automáticamente las peticiones entre Grok (xAI), Cerebras, Gemini y OpenRouter para maximizar las cuotas gratuitas.
*   **Streaming en Tiempo Real**: Respuestas instantáneas palabra por palabra usando ReadableStreams.
*   **Sin Costo**: Diseñado para aprovechar las capas gratuitas de proveedores de alto rendimiento.
*   **Frontend Incluido**: Interfaz de chat web para probar el servicio inmediatamente.
*   **Extensible**: Arquitectura modular basada en interfaces para agregar nuevos servicios fácilmente.
*   **Optimizado con Bun**: Alto rendimiento y baja latencia.

## Servicios Soportados

| Servicio | Límite Aprox. (Free) | Modelo Implementado |
| :--- | :--- | :--- |
| **Grok (xAI)** | Variable | `grok-2-1212` |
| **Cerebras** | ~30 req/min | `llama3.1-8b` |
| **Google Gemini** | ~60 req/min | `gemini-1.5-flash` |
| **OpenRouter** | Variable | `meta-llama/llama-3-8b-instruct:free` |

## Requisitos Previos

*   [Bun](https://bun.sh) instalado en tu sistema.
*   Claves API (API Keys) de los servicios que desees utilizar (no necesitas todas, el sistema usará las configuradas).

## Instalación

1.  **Clonar el repositorio**:
    ```bash
    git clone <url-del-repo>
    cd bun-ai-api
    ```

2.  **Instalar dependencias**:
    ```bash
    bun install
    ```

3.  **Configurar variables de entorno**:
    Copia el archivo de ejemplo y edítalo:
    ```bash
    cp .env.example .env
    ```
    Edita `.env` y agrega tus claves API.

    **Obtención de API Keys:**
    *   **Grok/xAI**: [https://x.ai/](https://x.ai/) - Inicia sesión y ve a la consola de API.
    *   **Cerebras**: [https://cloud.cerebras.ai/](https://cloud.cerebras.ai/) - Regístrate para obtener acceso a la inferencia rápida.
    *   **Gemini**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) - Obtén tu clave en Google AI Studio (requiere cuenta Google).
    *   **OpenRouter**: [https://openrouter.ai/keys](https://openrouter.ai/keys) - Conecta con múltiples modelos (algunos gratuitos).

4.  **Iniciar el servidor**:
    
    Modo desarrollo (recarga automática):
    ```bash
    bun run dev
    ```

    Modo producción:
    ```bash
    bun run start
    ```

## Uso de la API

El servidor correrá en `http://localhost:3000` por defecto.

### Endpoint de Chat

*   **URL**: `POST /chat`
*   **Headers**: `Content-Type: application/json`
*   **Body**:
    ```json
    {
      "messages": [
        { "role": "user", "content": "¿Cómo resolver la serie de Fibonacci en TS?" }
      ]
    }
    ```

### Respuesta
La respuesta es un stream de eventos de texto (`text/event-stream`). Recibirás el texto generado fragmento a fragmento.

### Ejemplo con cURL
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{ "messages": [{ "role": "user", "content": "Hola mundo" }] }'
```

## Frontend de Prueba
Abre tu navegador y ve a `http://localhost:3000` para usar la interfaz de chat incluida. Podrás ver qué servicio responde cada mensaje.

## Deployment

Este proyecto incluye un archivo `nixpacks.toml` listo para desplegar en plataformas como **Coolify** o **Railway**.

1.  Sube tu código a GitHub/GitLab.
2.  Crea un nuevo servicio en Coolify/Railway apuntando al repo.
3.  Establece las variables de entorno en la configuración del servicio.
4.  ¡Listo! Nixpacks detectará la configuración de Bun automáticamente.

## Estructura del Proyecto

*   `/services`: Implementaciones individuales de cada proveedor de IA.
*   `/public`: Archivos estáticos del frontend.
*   `index.ts`: Servidor principal y lógica de rotación.
*   `types.ts`: Definiciones de TypeScript.

## Troubleshooting

*   **Error 404 en /chat**: Asegúrate de enviar una petición POST, no GET.
*   **API Key Errors**: Revisa que el archivo `.env` tenga las claves correctas y sin espacios extra.
*   **Streaming no funciona**: Verifica que tu cliente soporte streaming HTTP y no esté esperando la respuesta completa (buffer).
