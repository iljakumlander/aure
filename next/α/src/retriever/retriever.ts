/**
 * Retriever implementation.
 * Embeds a query, searches the vector DB, extracts highlights.
 */

import type { Embedder, VectorDBAdapter, Retriever } from '../types/adapters.js';
import type { RetrievalConfig } from '../types/config.js';
import type { RetrievalOptions, RetrievalResult, SearchFilter } from '../types/document.js';
import { extractHighlights } from './highlights.js';
import { rerankByKeywordOverlap } from './reranker.js';

export interface RetrievalMeta {
  queryEmbeddingTimeMs: number;
  searchTimeMs: number;
  totalTimeMs: number;
  chunksSearched: number;
  chunksReturned: number;
}

export interface RetrieverWithMeta extends Retriever {
  lastRetrievalMeta(): RetrievalMeta | null;
}

export function createRetriever(
  embedder: Embedder,
  vectordb: VectorDBAdapter,
  config: RetrievalConfig,
): RetrieverWithMeta {
  let meta: RetrievalMeta | null = null;

  return {
    async retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]> {
      const totalStart = Date.now();

      const topK = options?.topK ?? config.topK;
      const scoreThreshold = options?.scoreThreshold ?? config.scoreThreshold;
      const documentFilter = options?.documentFilter;

      // Embed query
      const embedStart = Date.now();
      const queryVector = await embedder.embed(query);
      const queryEmbeddingTimeMs = Date.now() - embedStart;

      // Search vectors
      const searchStart = Date.now();
      const filter: SearchFilter | undefined = documentFilter
        ? { documentIds: documentFilter }
        : undefined;
      let searchResults = await vectordb.search(queryVector, topK, filter);
      const searchTimeMs = Date.now() - searchStart;
      const chunksSearched = searchResults.length;

      // Optional reranking
      if (config.rerank) {
        searchResults = rerankByKeywordOverlap(query, searchResults);
      }

      // Filter by score threshold
      searchResults = searchResults.filter(r => r.score >= scoreThreshold);

      // Trim to topK (reranking may reorder but not expand)
      searchResults = searchResults.slice(0, topK);

      // Map to RetrievalResult with highlights
      const results: RetrievalResult[] = searchResults.map(r => ({
        chunk: r.entry.metadata,
        score: r.score,
        highlights: extractHighlights(query, r.entry.metadata.text),
      }));

      meta = {
        queryEmbeddingTimeMs,
        searchTimeMs,
        totalTimeMs: Date.now() - totalStart,
        chunksSearched,
        chunksReturned: results.length,
      };

      return results;
    },

    lastRetrievalMeta(): RetrievalMeta | null {
      return meta;
    },
  };
}
