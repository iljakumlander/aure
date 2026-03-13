import { describe, it, expect } from 'vitest';
import { tokenize, extractHighlights } from './highlights.js';

describe('tokenize', () => {
  it('splits text into lowercase words', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('strips punctuation', () => {
    expect(tokenize('Hello, world! How?')).toEqual(['hello', 'world']);
  });

  it('removes stopwords', () => {
    expect(tokenize('the cat is on the mat')).toEqual(['cat', 'mat']);
  });

  it('drops words shorter than 2 chars', () => {
    expect(tokenize('I a am go x test')).toEqual(['am', 'go', 'test']);
  });

  it('returns empty for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty for only stopwords', () => {
    expect(tokenize('the is are was')).toEqual([]);
  });
});

describe('extractHighlights', () => {
  it('finds single word match', () => {
    const highlights = extractHighlights('python', 'Learn Python programming today');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe('Python');
  });

  it('finds multiple word matches', () => {
    const highlights = extractHighlights('machine learning', 'This machine uses learning algorithms');
    expect(highlights.length).toBeGreaterThanOrEqual(1);
    const texts = highlights.map(h => h.text.toLowerCase());
    expect(texts.some(t => t.includes('machine'))).toBe(true);
    expect(texts.some(t => t.includes('learning'))).toBe(true);
  });

  it('merges adjacent matches', () => {
    const highlights = extractHighlights('machine learning', 'Study machine learning today');
    // "machine learning" are adjacent words — should merge into one span
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe('machine learning');
  });

  it('returns correct offsets', () => {
    const chunk = 'The python language is great';
    const highlights = extractHighlights('python', chunk);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].start).toBe(4);
    expect(highlights[0].end).toBe(10);
    expect(chunk.slice(highlights[0].start, highlights[0].end)).toBe('python');
  });

  it('is case insensitive', () => {
    const highlights = extractHighlights('PYTHON', 'learn python basics');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe('python');
  });

  it('returns empty when no matches', () => {
    const highlights = extractHighlights('quantum physics', 'Learn to cook pasta');
    expect(highlights).toEqual([]);
  });

  it('ignores stopwords in query', () => {
    const highlights = extractHighlights('what is the meaning of life', 'The meaning of life is 42');
    const texts = highlights.map(h => h.text.toLowerCase());
    expect(texts.some(t => t.includes('meaning'))).toBe(true);
    expect(texts.some(t => t.includes('life'))).toBe(true);
  });

  it('handles word with trailing punctuation', () => {
    const highlights = extractHighlights('python', 'I love Python.');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].text).toBe('Python');
  });

  it('highlights multiple occurrences', () => {
    const highlights = extractHighlights('python', 'Python is great. Learn Python today.');
    expect(highlights).toHaveLength(2);
  });

  it('preserves original text casing in output', () => {
    const highlights = extractHighlights('python', 'Learn PYTHON basics');
    expect(highlights[0].text).toBe('PYTHON');
  });

  it('returns empty for empty query', () => {
    expect(extractHighlights('', 'some text')).toEqual([]);
  });

  it('returns empty for stopword-only query', () => {
    expect(extractHighlights('the is are', 'the is are here')).toEqual([]);
  });
});
