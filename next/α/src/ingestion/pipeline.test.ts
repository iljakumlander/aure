import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Embedder } from '../types/index.js';
import type { ResolvedAlphaConfig } from '../types/config.js';
import { PI5_PRESET } from '../config/presets.js';
import { createPipeline } from './pipeline.js';

const TEST_DIR = join(tmpdir(), 'aure-pipeline-test-' + Date.now());
const REF_DIR = join(TEST_DIR, 'reference');
const DB_PATH = join(TEST_DIR, 'test-vectors.db');

const DIMS = 4;

/** Mock embedder that returns deterministic vectors. */
function createMockEmbedder(): Embedder {
  return {
    dimensions: DIMS,
    modelId: 'mock-embed',
    async embed(text: string): Promise<number[]> {
      // Hash text to get a deterministic vector
      const sum = [...text].reduce((s, c) => s + c.charCodeAt(0), 0);
      return [sum % 10 / 10, (sum + 1) % 10 / 10, (sum + 2) % 10 / 10, (sum + 3) % 10 / 10];
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map(t => this.embed(t)));
    },
  };
}

function makeConfig(): ResolvedAlphaConfig {
  return {
    ...PI5_PRESET,
    embedding: { ...PI5_PRESET.embedding, model: 'mock-embed', dimensions: DIMS },
    vectordb: { adapter: 'sqlite-vec', path: DB_PATH },
    reference: { ...PI5_PRESET.reference, path: REF_DIR },
  };
}

beforeEach(() => {
  mkdirSync(REF_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('ingestion pipeline', () => {
  it('processes new files', async () => {
    writeFileSync(join(REF_DIR, 'notes.txt'), 'Hello world this is a test document.');
    writeFileSync(join(REF_DIR, 'readme.md'), '# Title\n\nSome content here.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });
    const result = await pipeline.ingest();

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.totalChunks).toBeGreaterThan(0);

    await pipeline.close();
  });

  it('skips unchanged files on second run', async () => {
    writeFileSync(join(REF_DIR, 'notes.txt'), 'Some content.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });

    const first = await pipeline.ingest();
    expect(first.processed).toBe(1);

    const second = await pipeline.ingest();
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(1);

    await pipeline.close();
  });

  it('reprocesses modified files', async () => {
    const filePath = join(REF_DIR, 'notes.txt');
    writeFileSync(filePath, 'Version one.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });

    await pipeline.ingest();

    // Modify the file
    writeFileSync(filePath, 'Version two with different content.');

    const result = await pipeline.ingest();
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);

    await pipeline.close();
  });

  it('removes deleted files', async () => {
    const filePath = join(REF_DIR, 'temp.txt');
    writeFileSync(filePath, 'Temporary content.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });

    await pipeline.ingest();

    // Delete the file
    unlinkSync(filePath);

    const result = await pipeline.ingest();
    expect(result.removed).toBe(1);

    await pipeline.close();
  });

  it('force reprocesses everything', async () => {
    writeFileSync(join(REF_DIR, 'notes.txt'), 'Content.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });

    await pipeline.ingest();

    const result = await pipeline.ingest({ force: true });
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);

    await pipeline.close();
  });

  it('dry run does not store anything', async () => {
    writeFileSync(join(REF_DIR, 'notes.txt'), 'Content.');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });

    const result = await pipeline.ingest({ dryRun: true });
    expect(result.processed).toBe(1);

    // Nothing should be persisted
    const second = await pipeline.ingest({ dryRun: true });
    expect(second.processed).toBe(1); // Still "new" because dry run didn't store

    await pipeline.close();
  });

  it('reports progress', async () => {
    writeFileSync(join(REF_DIR, 'a.txt'), 'File A.');
    writeFileSync(join(REF_DIR, 'b.txt'), 'File B.');

    const progress: Array<{ current: number; total: number; file: string }> = [];

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });
    await pipeline.ingest({
      onProgress: (current, total, file) => progress.push({ current, total, file }),
    });

    expect(progress).toHaveLength(2);
    expect(progress[0].total).toBe(2);

    await pipeline.close();
  });

  it('handles unsupported file types gracefully', async () => {
    writeFileSync(join(REF_DIR, 'image.png'), 'fake png');

    const pipeline = createPipeline(makeConfig(), { embedder: createMockEmbedder() });
    const result = await pipeline.ingest();

    // .png is not in supportedTypes, so scanner should skip it
    expect(result.processed).toBe(0);
    expect(result.errors).toHaveLength(0);

    await pipeline.close();
  });
});
