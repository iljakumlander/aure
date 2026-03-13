import { describe, it, expect } from 'vitest';
import { createSemanticChunker } from './semantic.js';
import type { ParsedDocument } from '../types/index.js';

const defaultConfig = { strategy: 'semantic' as const, maxTokens: 50, overlap: 0, respectBoundaries: true };

describe('semantic chunker', () => {
  it('keeps small section as single chunk', () => {
    const doc: ParsedDocument = {
      filePath: '/test/doc.md',
      rawText: '# Title\n\nShort content.',
      sections: [{
        heading: 'Title',
        content: '# Title\n\nShort content.',
        charStart: 0,
        charEnd: 23,
      }],
    };
    const chunker = createSemanticChunker(defaultConfig);
    const chunks = chunker.chunk(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionHeading).toBe('Title');
  });

  it('splits large section at paragraph boundaries', () => {
    const para1 = Array.from({ length: 30 }, (_, i) => `alpha${i}`).join(' ');
    const para2 = Array.from({ length: 30 }, (_, i) => `beta${i}`).join(' ');
    const content = `${para1}\n\n${para2}`;
    const doc: ParsedDocument = {
      filePath: '/test/doc.txt',
      rawText: content,
      sections: [{ content, charStart: 0, charEnd: content.length }],
    };
    const chunker = createSemanticChunker(defaultConfig);
    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles multiple sections', () => {
    const s1 = '# A\n\nContent A.';
    const s2 = '# B\n\nContent B.';
    const rawText = `${s1}\n\n${s2}`;
    const doc: ParsedDocument = {
      filePath: '/test/doc.md',
      rawText,
      sections: [
        { heading: 'A', content: s1, charStart: 0, charEnd: s1.length },
        { heading: 'B', content: s2, charStart: s1.length + 2, charEnd: rawText.length },
      ],
    };
    const chunker = createSemanticChunker(defaultConfig);
    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBe(2);
    expect(chunks[0].sectionHeading).toBe('A');
    expect(chunks[1].sectionHeading).toBe('B');
  });

  it('force-splits oversized paragraphs', () => {
    const bigParagraph = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const doc: ParsedDocument = {
      filePath: '/test/big.txt',
      rawText: bigParagraph,
      sections: [{ content: bigParagraph, charStart: 0, charEnd: bigParagraph.length }],
    };
    const chunker = createSemanticChunker(defaultConfig);
    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should have text content
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('produces sequential chunkIndex across sections', () => {
    const s1 = 'Short section one.';
    const s2 = 'Short section two.';
    const rawText = `${s1}\n\n${s2}`;
    const doc: ParsedDocument = {
      filePath: '/test/doc.txt',
      rawText,
      sections: [
        { content: s1, charStart: 0, charEnd: s1.length },
        { content: s2, charStart: s1.length + 2, charEnd: rawText.length },
      ],
    };
    const chunker = createSemanticChunker({ ...defaultConfig, maxTokens: 200 });
    const chunks = chunker.chunk(doc);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});
