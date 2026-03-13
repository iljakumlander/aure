/**
 * Chunker factory.
 * Dispatches on config.strategy to create the right chunker.
 */

import type { ChunkingConfig } from '../types/config.js';
import type { ParsedDocument, ChunkMetadata } from '../types/index.js';
import { createFixedChunker } from './fixed.js';
import { createSemanticChunker } from './semantic.js';

export interface Chunker {
  chunk(doc: ParsedDocument): ChunkMetadata[];
}

export function createChunker(config: ChunkingConfig): Chunker {
  switch (config.strategy) {
    case 'fixed':
      return createFixedChunker(config);
    case 'semantic':
      return createSemanticChunker(config);
    default:
      throw new Error(`Unknown chunking strategy: ${config.strategy}`);
  }
}

export { createFixedChunker } from './fixed.js';
export { createSemanticChunker } from './semantic.js';
export { estimateTokens } from './tokens.js';
