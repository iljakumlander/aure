import { describe, it, expect } from 'vitest';
import { rerankByKeywordOverlap } from './reranker.js';
import type { SearchResult } from '../types/index.js';

function makeResult(score: number, text: string, id = 'test'): SearchResult {
  return {
    entry: {
      id,
      documentId: 'doc-1',
      vector: [],
      metadata: {
        filePath: '/test.md',
        fileName: 'test.md',
        charStart: 0,
        charEnd: text.length,
        chunkIndex: 0,
        text,
      },
    },
    score,
  };
}

describe('rerankByKeywordOverlap', () => {
  it('promotes results with keyword matches', () => {
    const results = [
      makeResult(0.8, 'This is about cooking recipes', 'a'),
      makeResult(0.7, 'Python programming language basics', 'b'),
    ];
    const reranked = rerankByKeywordOverlap('python programming', results);
    // Second result has keyword matches, should be promoted
    expect(reranked[0].entry.id).toBe('b');
  });

  it('returns empty array for empty input', () => {
    expect(rerankByKeywordOverlap('test', [])).toEqual([]);
  });

  it('handles single result', () => {
    const results = [makeResult(0.8, 'Python basics')];
    const reranked = rerankByKeywordOverlap('python', results);
    expect(reranked).toHaveLength(1);
  });

  it('computes correct blended score', () => {
    const results = [makeResult(0.8, 'Python is great')];
    const reranked = rerankByKeywordOverlap('python', results);
    // semantic: 0.7 * 0.8 = 0.56, keyword: 0.3 * 1.0 = 0.3, total: 0.86
    expect(reranked[0].score).toBeCloseTo(0.86, 5);
  });

  it('does not mutate input array', () => {
    const results = [
      makeResult(0.5, 'cooking', 'a'),
      makeResult(0.9, 'python programming', 'b'),
    ];
    const original = [...results];
    rerankByKeywordOverlap('python', results);
    expect(results[0].entry.id).toBe(original[0].entry.id);
    expect(results[1].entry.id).toBe(original[1].entry.id);
  });

  it('handles stopword-only query gracefully', () => {
    const results = [makeResult(0.8, 'some text')];
    const reranked = rerankByKeywordOverlap('the is are', results);
    // No meaningful query terms, returns copy with original scores
    expect(reranked).toHaveLength(1);
    expect(reranked[0].score).toBe(0.8);
  });
});
