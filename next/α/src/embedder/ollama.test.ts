import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOllamaEmbedder } from './ollama.js';
import type { EmbeddingConfig } from '../types/config.js';

const config: EmbeddingConfig = {
  provider: 'ollama',
  model: 'all-minilm',
  baseUrl: 'http://localhost:11434',
  dimensions: 384,
  batchSize: 4,
};

const mockVector = Array.from({ length: 384 }, (_, i) => i * 0.001);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ollama embedder', () => {
  it('has correct dimensions and modelId', () => {
    const embedder = createOllamaEmbedder(config);
    expect(embedder.dimensions).toBe(384);
    expect(embedder.modelId).toBe('all-minilm');
  });

  it('embed() calls /api/embed with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [mockVector] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const embedder = createOllamaEmbedder(config);
    const result = await embedder.embed('test text');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('all-minilm');
    expect(body.input).toBe('test text');
    expect(result).toEqual(mockVector);
  });

  it('embedBatch() sends array input', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [mockVector, mockVector] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const embedder = createOllamaEmbedder(config);
    const result = await embedder.embedBatch(['text1', 'text2']);

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input).toEqual(['text1', 'text2']);
    expect(result).toHaveLength(2);
  });

  it('embedBatch() splits into sub-batches', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [mockVector, mockVector, mockVector, mockVector] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const embedder = createOllamaEmbedder(config); // batchSize=4
    const texts = Array.from({ length: 8 }, (_, i) => `text${i}`);
    const result = await embedder.embedBatch(texts);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(8);
  });

  it('embedBatch() returns empty array for empty input', async () => {
    const embedder = createOllamaEmbedder(config);
    const result = await embedder.embedBatch([]);
    expect(result).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    }));

    const embedder = createOllamaEmbedder(config);
    await expect(embedder.embed('test')).rejects.toThrow('Ollama embed failed (404)');
  });

  it('throws on malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ wrong: 'shape' }),
    }));

    const embedder = createOllamaEmbedder(config);
    await expect(embedder.embed('test')).rejects.toThrow('missing embeddings array');
  });
});
