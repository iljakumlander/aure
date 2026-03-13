/**
 * Ollama embedding adapter.
 * Calls the /api/embed endpoint for vector computation.
 */

import type { Embedder } from '../types/index.js';
import type { EmbeddingConfig } from '../types/config.js';

const TIMEOUT_MS = 120_000;
const CONTEXT_LENGTH_ERROR = 'input length exceeds';

/**
 * Truncate text to a maximum number of words.
 */
function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

export function createOllamaEmbedder(config: EmbeddingConfig): Embedder {
  const { model, baseUrl, dimensions, batchSize } = config;

  async function callEmbed(input: string | string[]): Promise<number[][]> {
    const url = `${baseUrl}/api/embed`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input, truncate: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown error');
      throw new Error(`Ollama embed failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { embeddings: number[][] };
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Ollama embed response missing embeddings array');
    }

    return data.embeddings;
  }

  /**
   * Embed with automatic retry on context length errors.
   * Progressively truncates text until it fits the model's context.
   */
  async function embedWithRetry(input: string | string[]): Promise<number[][]> {
    try {
      return await callEmbed(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes(CONTEXT_LENGTH_ERROR)) throw err;

      // Retry individual texts with truncation
      const texts = Array.isArray(input) ? input : [input];
      const results: number[][] = [];

      for (const text of texts) {
        let words = text.split(/\s+/);
        let truncated = text;

        // Halve text until it fits, up to 4 attempts
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const embeddings = await callEmbed(truncated);
            results.push(embeddings[0]);
            break;
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : '';
            if (!retryMsg.includes(CONTEXT_LENGTH_ERROR) || attempt === 3) throw retryErr;
            words = words.slice(0, Math.ceil(words.length / 2));
            truncated = words.join(' ');
          }
        }
      }

      return results;
    }
  }

  return {
    dimensions,
    modelId: model,

    async embed(text: string): Promise<number[]> {
      const embeddings = await embedWithRetry(text);
      return embeddings[0];
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      // Split into sub-batches if exceeding batchSize
      if (texts.length <= batchSize) {
        return embedWithRetry(texts);
      }

      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await embedWithRetry(batch);
        results.push(...embeddings);
      }
      return results;
    },
  };
}
