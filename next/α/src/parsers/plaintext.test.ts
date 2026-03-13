import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlaintextParser } from './plaintext.js';

const TEST_DIR = join(tmpdir(), 'aure-parser-txt-' + Date.now());
const parser = createPlaintextParser();

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('plaintext parser', () => {
  it('handles .txt extension', () => {
    expect(parser.extensions).toContain('.txt');
  });

  it('parses file into single section', async () => {
    const content = 'Hello world.\nThis is a test.';
    writeFileSync(join(TEST_DIR, 'test.txt'), content);

    const result = await parser.parse(join(TEST_DIR, 'test.txt'));
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].content).toBe(content);
    expect(result.sections[0].charStart).toBe(0);
    expect(result.sections[0].charEnd).toBe(content.length);
  });

  it('sets title from filename', async () => {
    writeFileSync(join(TEST_DIR, 'notes.txt'), 'content');
    const result = await parser.parse(join(TEST_DIR, 'notes.txt'));
    expect(result.title).toBe('notes');
  });

  it('preserves rawText', async () => {
    const content = 'Line 1\nLine 2\nLine 3';
    writeFileSync(join(TEST_DIR, 'raw.txt'), content);
    const result = await parser.parse(join(TEST_DIR, 'raw.txt'));
    expect(result.rawText).toBe(content);
  });
});
