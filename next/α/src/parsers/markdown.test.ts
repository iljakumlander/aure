import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMarkdownParser } from './markdown.js';

const TEST_DIR = join(tmpdir(), 'aure-parser-md-' + Date.now());
const parser = createMarkdownParser();

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('markdown parser', () => {
  it('handles .md and .markdown extensions', () => {
    expect(parser.extensions).toContain('.md');
    expect(parser.extensions).toContain('.markdown');
  });

  it('splits on headings', async () => {
    const content = '# Title\n\nIntro text.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.';
    writeFileSync(join(TEST_DIR, 'doc.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'doc.md'));
    expect(result.sections.length).toBe(3);
    expect(result.sections[0].heading).toBe('Title');
    expect(result.sections[1].heading).toBe('Section A');
    expect(result.sections[2].heading).toBe('Section B');
  });

  it('captures content before first heading', async () => {
    const content = 'Preamble text.\n\n# Heading\n\nBody.';
    writeFileSync(join(TEST_DIR, 'pre.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'pre.md'));
    expect(result.sections[0].heading).toBeUndefined();
    expect(result.sections[0].content).toBe('Preamble text.');
    expect(result.sections[1].heading).toBe('Heading');
  });

  it('handles file with no headings', async () => {
    const content = 'Just plain text\nwith no headings.';
    writeFileSync(join(TEST_DIR, 'plain.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'plain.md'));
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBeUndefined();
    expect(result.sections[0].content).toBe(content);
  });

  it('uses first H1 as title', async () => {
    const content = '## Not title\n\n# Real Title\n\nBody.';
    writeFileSync(join(TEST_DIR, 'title.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'title.md'));
    expect(result.title).toBe('Real Title');
  });

  it('falls back to filename for title when no H1', async () => {
    const content = '## Just H2\n\nBody.';
    writeFileSync(join(TEST_DIR, 'fallback.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'fallback.md'));
    expect(result.title).toBe('fallback');
  });

  it('tracks correct charStart/charEnd offsets', async () => {
    const content = '# A\n\nText A.\n\n# B\n\nText B.';
    writeFileSync(join(TEST_DIR, 'offsets.md'), content);

    const result = await parser.parse(join(TEST_DIR, 'offsets.md'));
    // Sections should cover the entire document without gaps
    for (const section of result.sections) {
      expect(section.charStart).toBeGreaterThanOrEqual(0);
      expect(section.charEnd).toBeLessThanOrEqual(content.length);
      expect(section.charEnd).toBeGreaterThan(section.charStart);
    }
  });
});
