/**
 * Ollama adapter — talks to a local Ollama instance.
 *
 * This is the default provider for aure.
 * No API keys, no cloud, no cost, no data leaving your network.
 * Perfect for Raspberry Pi.
 */

import type { OllamaProvider } from '../types/index.js';
import type { LLMAdapter, LLMMessage, LLMResponse } from './provider.js';

const DEFAULTS = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  maxTokens: 512,
  temperature: 0.7,
};

export function createOllamaAdapter(config: OllamaProvider): LLMAdapter {
  const baseUrl = config.baseUrl ?? DEFAULTS.baseUrl;
  const model = config.model ?? DEFAULTS.model;
  const maxTokens = config.maxTokens ?? DEFAULTS.maxTokens;
  const temperature = config.temperature ?? DEFAULTS.temperature;

  return {
    name: `ollama/${model}`,

    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            num_predict: maxTokens,
            temperature,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama error (${response.status}): ${text}`);
      }

      const data = await response.json() as any;

      return {
        content: data.message?.content ?? '',
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
        },
      };
    },

    async health(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`);
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
