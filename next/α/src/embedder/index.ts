/**
 * Embedder factory.
 */

import type { Embedder } from '../types/index.js';
import type { EmbeddingConfig } from '../types/config.js';
import { createOllamaEmbedder } from './ollama.js';

export function createEmbedder(config: EmbeddingConfig): Embedder {
  if (config.provider !== 'ollama') {
    throw new Error(`Unsupported embedding provider: ${config.provider}`);
  }
  return createOllamaEmbedder(config);
}

export { createOllamaEmbedder } from './ollama.js';
