import { describe, it, expect } from 'vitest';
import { createFixedChunker } from './fixed.js';
import type { ParsedDocument } from '../types/index.js';

function makeDoc(text: string): ParsedDocument {
  return {
    filePath: '/test/doc.txt',
    rawText: text,
    sections: [{ content: text, charStart: 0, charEnd: text.length }],
  };
}

describe('fixed chunker', () => {
  it('keeps short text as single chunk', () => {
    const chunker = createFixedChunker({ strategy: 'fixed', maxTokens: 100, overlap: 0, respectBoundaries: false });
    const doc = makeDoc('Short text.');
    const chunks = chunker.chunk(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Short text.');
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it('splits long text into multiple chunks', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const chunker = createFixedChunker({ strategy: 'fixed', maxTokens: 50, overlap: 0, respectBoundaries: false });
    const doc = makeDoc(words);
    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('produces sequential chunkIndex', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const chunker = createFixedChunker({ strategy: 'fixed', maxTokens: 50, overlap: 0, respectBoundaries: false });
    const chunks = chunker.chunk(makeDoc(words));
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it('sets filePath and fileName', () => {
    const chunker = createFixedChunker({ strategy: 'fixed', maxTokens: 100, overlap: 0, respectBoundaries: false });
    const chunks = chunker.chunk(makeDoc('Hello world'));
    expect(chunks[0].filePath).toBe('/test/doc.txt');
    expect(chunks[0].fileName).toBe('doc.txt');
  });

  it('carries section metadata to chunks', () => {
    const doc: ParsedDocument = {
      filePath: '/test/doc.md',
      rawText: 'Content here',
      sections: [{
        heading: 'My Section',
        content: 'Content here',
        pageNumber: 2,
        charStart: 0,
        charEnd: 12,
      }],
    };
    const chunker = createFixedChunker({ strategy: 'fixed', maxTokens: 100, overlap: 0, respectBoundaries: false });
    const chunks = chunker.chunk(doc);
    expect(chunks[0].sectionHeading).toBe('My Section');
    expect(chunks[0].pageNumber).toBe(2);
  });
});
