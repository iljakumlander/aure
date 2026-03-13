/**
 * LLM adapter interface.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LLMStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; totalContent: string }
  | { type: 'error'; error: string };

export interface LLMAdapter {
  chat(messages: LLMMessage[], signal?: AbortSignal): AsyncIterable<LLMStreamEvent>;
  isAvailable(): Promise<boolean>;
}
