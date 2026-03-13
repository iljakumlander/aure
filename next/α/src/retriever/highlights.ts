/**
 * Highlight extraction for retrieval results.
 * Finds which parts of a chunk text match query terms (token overlap).
 */

import type { TextHighlight } from '../types/index.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
  'to', 'for', 'of', 'and', 'or', 'but', 'not', 'with', 'from',
  'by', 'as', 'it', 'this', 'that', 'be', 'has', 'have', 'had',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should',
  'may', 'might', 'what', 'how', 'why', 'when', 'where', 'which',
  'who', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
]);

/**
 * Tokenize text into meaningful lowercase words.
 * Strips punctuation, removes stopwords, drops words < 2 chars.
 */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/\b\w+\b/g);
  if (!words) return [];
  return words.filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Find highlights in chunk text that match query terms.
 * Returns spans with positions relative to the chunk text.
 */
export function extractHighlights(query: string, chunkText: string): TextHighlight[] {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return [];

  // Find all matching word positions in chunk text
  const matches: Array<{ start: number; end: number }> = [];
  const wordRegex = /\b\w+\b/g;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(chunkText)) !== null) {
    const word = match[0].toLowerCase();
    if (word.length >= 2 && queryTerms.has(word)) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  if (matches.length === 0) return [];

  // Merge adjacent matches (within 3 chars gap)
  const merged: Array<{ start: number; end: number }> = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = matches[i];
    if (curr.start - prev.end <= 3) {
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged.map(span => ({
    text: chunkText.slice(span.start, span.end),
    start: span.start,
    end: span.end,
  }));
}
