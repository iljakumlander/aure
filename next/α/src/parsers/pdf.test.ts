import { describe, it, expect, vi } from 'vitest';
import { createPdfParser } from './pdf.js';

// Mock pdf-parse since we can't easily create real PDFs in tests
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'Page one content.\fPage two content.\fPage three content.',
    numpages: 3,
    info: { Title: 'Test PDF' },
  }),
}));

describe('pdf parser', () => {
  // Override readFileSync for the test
  vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return {
      ...actual,
      readFileSync: vi.fn().mockReturnValue(Buffer.from('fake pdf')),
    };
  });

  const parser = createPdfParser();

  it('handles .pdf extension', () => {
    expect(parser.extensions).toContain('.pdf');
  });

  it('extracts pages as sections', async () => {
    const result = await parser.parse('/fake/test.pdf');
    expect(result.sections.length).toBe(3);
    expect(result.sections[0].pageNumber).toBe(1);
    expect(result.sections[1].pageNumber).toBe(2);
    expect(result.sections[2].pageNumber).toBe(3);
  });

  it('uses PDF title metadata', async () => {
    const result = await parser.parse('/fake/test.pdf');
    expect(result.title).toBe('Test PDF');
  });

  it('sets pageCount', async () => {
    const result = await parser.parse('/fake/test.pdf');
    expect(result.pageCount).toBe(3);
  });

  it('preserves rawText', async () => {
    const result = await parser.parse('/fake/test.pdf');
    expect(result.rawText).toContain('Page one content.');
    expect(result.rawText).toContain('Page two content.');
  });
});
