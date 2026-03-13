import { describe, it, expect, vi } from 'vitest';
import { createRetriever } from './retriever.js';
import type { Embedder, VectorDBAdapter } from '../types/adapters.js';
import type { RetrievalConfig } from '../types/config.js';
import type { SearchResult, SearchFilter } from '../types/document.js';

const mockVector = Array.from({ length: 384 }, (_, i) => i * 0.001);

function makeChunk(text: string, id: string, docId = 'doc-1') {
  return {
    id,
    documentId: docId,
    vector: [],
    metadata: {
      filePath: `/reference/${id}.md`,
      fileName: `${id}.md`,
      charStart: 0,
      charEnd: text.length,
      chunkIndex: 0,
      text,
    },
  };
}

function createMockEmbedder(): Embedder {
  return {
    embed: vi.fn().mockResolvedValue(mockVector),
    embedBatch: vi.fn().mockResolvedValue([mockVector]),
    dimensions: 384,
    modelId: 'test-model',
  };
}

function createMockVectorDB(fixtures: SearchResult[]): VectorDBAdapter {
  return {
    initialize: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(async (_query: number[], topK: number, _filter?: SearchFilter) => {
      return fixtures.slice(0, topK);
    }),
    deleteByDocument: vi.fn(),
    stats: vi.fn().mockResolvedValue({ totalVectors: 0, documentsIndexed: 0, storageSizeBytes: 0 }),
    close: vi.fn(),
  };
}

const defaultConfig: RetrievalConfig = {
  topK: 5,
  scoreThreshold: 0.3,
  rerank: false,
};

const testResults: SearchResult[] = [
  { entry: makeChunk('Python programming language basics and tutorials', 'chunk-1'), score: 0.85 },
  { entry: makeChunk('Machine learning with neural networks explained', 'chunk-2'), score: 0.72 },
  { entry: makeChunk('Cooking recipes for pasta dishes', 'chunk-3'), score: 0.45 },
];

describe('createRetriever', () => {
  it('returns retrieval results', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('python basics');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk).toBeDefined();
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('respects topK from options', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('test', { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it('uses config topK as default', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const config = { ...defaultConfig, topK: 2 };
    const retriever = createRetriever(embedder, vectordb, config);

    const results = await retriever.retrieve('test');
    expect(results).toHaveLength(2);
  });

  it('filters by scoreThreshold', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('test', { scoreThreshold: 0.8 });
    expect(results.every(r => r.score >= 0.8)).toBe(true);
  });

  it('passes documentFilter to vectordb search', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    await retriever.retrieve('test', { documentFilter: ['doc-1'] });
    expect(vectordb.search).toHaveBeenCalledWith(
      mockVector,
      5,
      { documentIds: ['doc-1'] },
    );
  });

  it('includes highlights in results', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('python');
    expect(results[0].highlights.length).toBeGreaterThan(0);
    expect(results[0].highlights[0].text.toLowerCase()).toBe('python');
  });

  it('returns empty for no results', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB([]);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('nothing');
    expect(results).toEqual([]);
  });

  it('reranks when config.rerank is true', async () => {
    const embedder = createMockEmbedder();
    const results: SearchResult[] = [
      { entry: makeChunk('Cooking recipes for beginners', 'a'), score: 0.8 },
      { entry: makeChunk('Python programming language guide', 'b'), score: 0.7 },
    ];
    const vectordb = createMockVectorDB(results);
    const config = { ...defaultConfig, rerank: true };
    const retriever = createRetriever(embedder, vectordb, config);

    const retrieved = await retriever.retrieve('python programming');
    // Reranker should promote chunk-b (has keyword matches)
    expect(retrieved[0].chunk.text).toContain('Python');
  });

  it('preserves order when rerank is false', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    const results = await retriever.retrieve('test');
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('provides retrieval meta after call', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    expect(retriever.lastRetrievalMeta()).toBeNull();

    await retriever.retrieve('test');
    const meta = retriever.lastRetrievalMeta();
    expect(meta).not.toBeNull();
    expect(meta!.queryEmbeddingTimeMs).toBeGreaterThanOrEqual(0);
    expect(meta!.searchTimeMs).toBeGreaterThanOrEqual(0);
    expect(meta!.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(meta!.chunksSearched).toBeGreaterThan(0);
  });

  it('calls embedder.embed with the query', async () => {
    const embedder = createMockEmbedder();
    const vectordb = createMockVectorDB(testResults);
    const retriever = createRetriever(embedder, vectordb, defaultConfig);

    await retriever.retrieve('hello world');
    expect(embedder.embed).toHaveBeenCalledWith('hello world');
  });
});
