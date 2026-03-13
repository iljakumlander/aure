import { describe, it, expect } from 'vitest';
import { createDefaultParsers, getParserForFile } from './index.js';

describe('parser registry', () => {
  const parsers = createDefaultParsers();

  it('creates all default parsers', () => {
    expect(parsers.length).toBe(4);
  });

  it('finds parser for .txt', () => {
    expect(getParserForFile('notes.txt', parsers)).toBeDefined();
    expect(getParserForFile('notes.txt', parsers)!.extensions).toContain('.txt');
  });

  it('finds parser for .md', () => {
    expect(getParserForFile('README.md', parsers)).toBeDefined();
  });

  it('finds parser for .markdown', () => {
    expect(getParserForFile('doc.markdown', parsers)).toBeDefined();
  });

  it('finds parser for .pdf', () => {
    expect(getParserForFile('paper.pdf', parsers)).toBeDefined();
  });

  it('returns undefined for unsupported extension', () => {
    expect(getParserForFile('image.png', parsers)).toBeUndefined();
    expect(getParserForFile('data.json', parsers)).toBeUndefined();
  });

  it('works with full paths', () => {
    expect(getParserForFile('/path/to/file.md', parsers)).toBeDefined();
    expect(getParserForFile('/path/to/file.PDF', parsers)).toBeDefined(); // case-insensitive via toLowerCase
  });
});
