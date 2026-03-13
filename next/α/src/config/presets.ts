/**
 * Hardware presets for Aure α.
 * Each preset provides a complete, valid config tuned for specific hardware.
 */

import type { PresetName, ResolvedAlphaConfig } from '../types/config.js';

export const PI5_PRESET: ResolvedAlphaConfig = {
  preset: 'pi5',
  embedding: {
    provider: 'ollama',
    model: 'all-minilm',
    baseUrl: 'http://localhost:11434',
    dimensions: 384,
    batchSize: 8,
  },
  vectordb: {
    adapter: 'sqlite-vec',
    path: './aure-vectors.db',
  },
  chunking: {
    strategy: 'semantic',
    maxTokens: 256,
    overlap: 32,
    respectBoundaries: true,
  },
  retrieval: {
    topK: 3,
    scoreThreshold: 0.3,
    rerank: false,
  },
  reference: {
    path: './reference',
    watch: false,
    supportedTypes: ['.pdf', '.md', '.txt', '.epub'],
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  llm: {
    model: 'gemma3:1b',
  },
};

export const M_SERIES_PRESET: ResolvedAlphaConfig = {
  preset: 'm-series',
  embedding: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
    dimensions: 768,
    batchSize: 32,
  },
  vectordb: {
    adapter: 'sqlite-vec',
    path: './aure-vectors.db',
  },
  chunking: {
    strategy: 'semantic',
    maxTokens: 512,
    overlap: 64,
    respectBoundaries: true,
  },
  retrieval: {
    topK: 5,
    scoreThreshold: 0.3,
    rerank: false,
  },
  reference: {
    path: './reference',
    watch: false,
    supportedTypes: ['.pdf', '.md', '.txt', '.epub'],
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  llm: {
    model: 'gemma3:4b',
  },
};

export const GPU_PRESET: ResolvedAlphaConfig = {
  preset: 'gpu',
  embedding: {
    provider: 'ollama',
    model: 'mxbai-embed-large',
    baseUrl: 'http://localhost:11434',
    dimensions: 1024,
    batchSize: 64,
  },
  vectordb: {
    adapter: 'lancedb',
    path: './aure-vectors.db',
  },
  chunking: {
    strategy: 'semantic',
    maxTokens: 512,
    overlap: 64,
    respectBoundaries: true,
  },
  retrieval: {
    topK: 10,
    scoreThreshold: 0.3,
    rerank: false,
  },
  reference: {
    path: './reference',
    watch: false,
    supportedTypes: ['.pdf', '.md', '.txt', '.epub'],
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  llm: {
    model: 'llama3:8b',
  },
};

export const PRESETS: Record<string, ResolvedAlphaConfig> = {
  pi5: PI5_PRESET,
  'm-series': M_SERIES_PRESET,
  gpu: GPU_PRESET,
  custom: PI5_PRESET,
};

const VALID_PRESETS = new Set<string>(['pi5', 'm-series', 'gpu', 'custom']);

export function getPreset(name: string): ResolvedAlphaConfig {
  if (!VALID_PRESETS.has(name)) {
    throw new Error(`Unknown preset "${name}". Valid presets: ${[...VALID_PRESETS].join(', ')}`);
  }
  return PRESETS[name];
}
