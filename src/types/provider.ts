/**
 * LLM provider configuration.
 *
 * aure is provider-agnostic. By default it talks to Ollama
 * running locally (ideal for Raspberry Pi), but can be
 * configured to use cloud providers.
 *
 * Provider config lives in data/config.yaml alongside persona.
 */

export interface OllamaProvider {
  type: 'ollama';
  /** Ollama API base URL. Default: http://localhost:11434 */
  baseUrl?: string;
  /** Model name. Default: qwen2.5:3b */
  model?: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature (0-1). Lower = more predictable */
  temperature?: number;
}

export interface OpenAIProvider {
  type: 'openai';
  /** API key (from env or config) */
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicProvider {
  type: 'anthropic';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export type LLMProvider = OllamaProvider | OpenAIProvider | AnthropicProvider;

/** Default provider configuration */
export const DEFAULT_PROVIDER: OllamaProvider = {
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  maxTokens: 512,
  temperature: 0.7,
};
