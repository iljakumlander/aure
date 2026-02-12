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
  model: 'gemma3:1b',
  maxTokens: 512,
  temperature: 0.7,
  timeout: 600, // 10 minutes — Pi 5 can take 3-5 min for a response
};

export function createOllamaAdapter(config: OllamaProvider): LLMAdapter {
  const baseUrl = config.baseUrl ?? DEFAULTS.baseUrl;
  const model = config.model ?? DEFAULTS.model;
  const maxTokens = config.maxTokens ?? DEFAULTS.maxTokens;
  const temperature = config.temperature ?? DEFAULTS.temperature;
  const timeoutSec = config.timeout ?? DEFAULTS.timeout;

  return {
    name: `ollama/${model}`,

    async chat(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse> {
      const fetchOptions: RequestInit = {
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
      };

      // Combine timeout + external cancel signal.
      // When either fires, the fetch aborts and Ollama stops generation.
      const signals: AbortSignal[] = [];
      if (timeoutSec > 0) signals.push(AbortSignal.timeout(timeoutSec * 1000));
      if (signal) signals.push(signal);

      if (signals.length === 1) {
        fetchOptions.signal = signals[0];
      } else if (signals.length > 1) {
        fetchOptions.signal = AbortSignal.any(signals);
      }

      const response = await fetch(`${baseUrl}/api/chat`, fetchOptions);

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
