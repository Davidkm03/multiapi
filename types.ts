// Definición de tipos para el sistema de chat

export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface AIService {
  name: string;
  chat(messages: ChatMessage[]): AsyncGenerator<string, void, unknown>;
}
