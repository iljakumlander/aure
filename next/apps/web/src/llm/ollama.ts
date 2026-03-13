/**
 * Ollama LLM adapter — streaming /api/chat.
 */

import type { LLMAdapter, LLMMessage, LLMStreamEvent } from './types.js';

interface OllamaChatResponse {
  message?: { content: string };
  done?: boolean;
}

export function createOllamaAdapter(baseUrl: string, model: string): LLMAdapter {
  return {
    async *chat(messages, signal?) {
      let totalContent = '';

      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
          signal,
        });

        if (!res.ok) {
          const body = await res.text();
          yield { type: 'error', error: `Ollama ${res.status}: ${body}` };
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          yield { type: 'error', error: 'No response body' };
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed: OllamaChatResponse = JSON.parse(line);
              if (parsed.message?.content) {
                totalContent += parsed.message.content;
                yield { type: 'token', content: parsed.message.content };
              }
              if (parsed.done) {
                yield { type: 'done', totalContent };
                return;
              }
            } catch {
              // Skip malformed lines
            }
          }
        }

        // Stream ended without done flag
        if (totalContent) {
          yield { type: 'done', totalContent };
        }
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', error: message };
      }
    },

    async isAvailable() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
