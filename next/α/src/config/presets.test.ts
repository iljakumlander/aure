import { describe, it, expect } from 'vitest';
import { getPreset, PI5_PRESET, M_SERIES_PRESET, GPU_PRESET } from './presets.js';

describe('presets', () => {
  it('pi5 preset matches PROSPECT spec', () => {
    expect(PI5_PRESET.embedding.model).toBe('all-minilm');
    expect(PI5_PRESET.embedding.dimensions).toBe(384);
    expect(PI5_PRESET.vectordb.adapter).toBe('sqlite-vec');
    expect(PI5_PRESET.chunking.maxTokens).toBe(256);
    expect(PI5_PRESET.chunking.overlap).toBe(32);
    expect(PI5_PRESET.retrieval.topK).toBe(3);
    expect(PI5_PRESET.embedding.batchSize).toBe(8);
    expect(PI5_PRESET.llm.model).toBe('gemma3:1b');
  });

  it('m-series preset matches PROSPECT spec', () => {
    expect(M_SERIES_PRESET.embedding.model).toBe('nomic-embed-text');
    expect(M_SERIES_PRESET.embedding.dimensions).toBe(768);
    expect(M_SERIES_PRESET.chunking.maxTokens).toBe(512);
    expect(M_SERIES_PRESET.chunking.overlap).toBe(64);
    expect(M_SERIES_PRESET.retrieval.topK).toBe(5);
    expect(M_SERIES_PRESET.embedding.batchSize).toBe(32);
    expect(M_SERIES_PRESET.llm.model).toBe('gemma3:4b');
  });

  it('gpu preset matches PROSPECT spec', () => {
    expect(GPU_PRESET.embedding.model).toBe('mxbai-embed-large');
    expect(GPU_PRESET.embedding.dimensions).toBe(1024);
    expect(GPU_PRESET.vectordb.adapter).toBe('lancedb');
    expect(GPU_PRESET.chunking.maxTokens).toBe(512);
    expect(GPU_PRESET.retrieval.topK).toBe(10);
    expect(GPU_PRESET.embedding.batchSize).toBe(64);
    expect(GPU_PRESET.llm.model).toBe('llama3:8b');
  });

  it('getPreset returns correct preset by name', () => {
    expect(getPreset('pi5')).toBe(PI5_PRESET);
    expect(getPreset('m-series')).toBe(M_SERIES_PRESET);
    expect(getPreset('gpu')).toBe(GPU_PRESET);
  });

  it('custom preset falls back to pi5', () => {
    const custom = getPreset('custom');
    expect(custom).toBe(PI5_PRESET);
  });

  it('unknown preset throws', () => {
    expect(() => getPreset('banana')).toThrow('Unknown preset "banana"');
  });

  it('all presets have every required field', () => {
    for (const preset of [PI5_PRESET, M_SERIES_PRESET, GPU_PRESET]) {
      expect(preset.embedding.provider).toBe('ollama');
      expect(preset.embedding.baseUrl).toBeTruthy();
      expect(preset.vectordb.adapter).toBeTruthy();
      expect(preset.chunking.strategy).toBeTruthy();
      expect(preset.reference.path).toBeTruthy();
      expect(preset.server.port).toBeGreaterThan(0);
      expect(preset.llm.model).toBeTruthy();
    }
  });
});
