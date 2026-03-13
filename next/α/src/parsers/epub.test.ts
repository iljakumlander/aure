import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEpubParser } from './epub.js';

// Must use vi.hoisted so the ref exists when vi.mock factory runs (it's hoisted)
const mockGetChapterAsync = vi.hoisted(() => vi.fn());

vi.mock('epub2', () => {
  const mockEPub = {
    createAsync: vi.fn().mockResolvedValue({
      metadata: { title: 'Test Book' },
      flow: [
        { id: 'ch1' },
        { id: 'ch2' },
        { id: 'ch3' },
      ],
      toc: [
        { id: 'ch1', title: 'Introduction' },
        { id: 'ch2', title: 'Chapter One' },
        { id: 'ch3', title: 'Conclusion' },
      ],
      getChapterAsync: mockGetChapterAsync,
    }),
  };
  return { default: mockEPub, EPub: mockEPub };
});

describe('epub parser', () => {
  const parser = createEpubParser();

  beforeEach(() => {
    mockGetChapterAsync.mockReset();
    mockGetChapterAsync
      .mockResolvedValueOnce('<h1>Introduction</h1><p>This is the intro.</p>')
      .mockResolvedValueOnce('<h2>Chapter One</h2><p>The story begins here.</p><p>With a second paragraph.</p>')
      .mockResolvedValueOnce('<h3>Conclusion</h3><p>The end.</p>');
  });

  it('handles .epub extension', () => {
    expect(parser.extensions).toContain('.epub');
  });

  it('extracts chapters as sections', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.sections.length).toBe(3);
  });

  it('uses epub title metadata', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.title).toBe('Test Book');
  });

  it('sets heading from toc', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.sections[0].heading).toBe('Introduction');
    expect(result.sections[1].heading).toBe('Chapter One');
    expect(result.sections[2].heading).toBe('Conclusion');
  });

  it('strips HTML from chapter content', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.sections[0].content).toBe('Introduction\n\nThis is the intro.');
    expect(result.sections[0].content).not.toContain('<');
  });

  it('tracks charStart/charEnd offsets', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.sections[0].charStart).toBe(0);
    expect(result.sections[0].charEnd).toBe(result.sections[0].content.length);
    expect(result.sections[1].charStart).toBe(result.sections[0].charEnd + 1);
  });

  it('concatenates rawText from all chapters', async () => {
    const result = await parser.parse('/fake/book.epub');
    expect(result.rawText).toContain('This is the intro.');
    expect(result.rawText).toContain('The story begins here.');
    expect(result.rawText).toContain('The end.');
  });

  it('skips chapters that fail to load', async () => {
    mockGetChapterAsync.mockReset();
    mockGetChapterAsync
      .mockResolvedValueOnce('<p>Good chapter</p>')
      .mockRejectedValueOnce(new Error('Image-only chapter'))
      .mockResolvedValueOnce('<p>Another good chapter</p>');

    const result = await parser.parse('/fake/book.epub');
    expect(result.sections.length).toBe(2);
  });

  it('skips empty chapters', async () => {
    mockGetChapterAsync.mockReset();
    mockGetChapterAsync
      .mockResolvedValueOnce('<p>Real content</p>')
      .mockResolvedValueOnce('<div>   </div>')
      .mockResolvedValueOnce('<p>More content</p>');

    const result = await parser.parse('/fake/book.epub');
    expect(result.sections.length).toBe(2);
  });

  it('falls back to filename if no title metadata', async () => {
    const EPub = (await import('epub2')).default;
    const original = EPub.createAsync;
    EPub.createAsync = vi.fn().mockResolvedValue({
      metadata: {},
      flow: [{ id: 'ch1' }],
      toc: [],
      getChapterAsync: vi.fn().mockResolvedValue('<p>Content</p>'),
    });

    const result = await parser.parse('/fake/my-ebook.epub');
    expect(result.title).toBe('my-ebook');

    EPub.createAsync = original;
  });
});
