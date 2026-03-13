/**
 * Keyword-overlap reranker.
 * Re-scores search results by blending semantic similarity with keyword match ratio.
 */

import type { SearchResult } from '../types/index.js';
import { tokenize } from './highlights.js';

const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

/**
 * Re-rank search results using keyword overlap with the query.
 * Blends semantic score (0.7) with keyword match ratio (0.3).
 * Returns a new array sorted by blended score, does not mutate input.
 */
export function rerankByKeywordOverlap(query: string, results: SearchResult[]): SearchResult[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || results.length === 0) return [...results];

  const querySet = new Set(queryTerms);

  const scored = results.map(result => {
    const chunkTokens = new Set(tokenize(result.entry.metadata.text));
    let matchCount = 0;
    for (const term of querySet) {
      if (chunkTokens.has(term)) matchCount++;
    }
    const keywordScore = matchCount / querySet.size;
    const blendedScore = SEMANTIC_WEIGHT * result.score + KEYWORD_WEIGHT * keywordScore;

    return {
      ...result,
      score: blendedScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
