import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createSqliteVecAdapter } from './sqlite-vec.js';
import type { VectorEntry } from '../types/index.js';

const TEST_DIR = join(tmpdir(), 'aure-vec-test-' + Date.now());
const DIMS = 4;

let db: InstanceType<typeof Database>;

function makeEntry(id: string, docId: string, vector: number[], text: string): VectorEntry {
  return {
    id,
    documentId: docId,
    vector,
    metadata: {
      filePath: `/ref/${docId}.txt`,
      fileName: `${docId}.txt`,
      charStart: 0,
      charEnd: text.length,
      chunkIndex: 0,
      text,
    },
  };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = new Database(join(TEST_DIR, 'test.db'));
  sqliteVec.load(db);
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('sqlite-vec adapter', () => {
  it('initializes without error', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();
  });

  it('upserts entries and reflects in stats', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();

    await adapter.upsert([
      makeEntry('c1', 'doc1', [1, 0, 0, 0], 'hello'),
      makeEntry('c2', 'doc1', [0, 1, 0, 0], 'world'),
    ]);

    const stats = await adapter.stats();
    expect(stats.totalVectors).toBe(2);
    expect(stats.documentsIndexed).toBe(1);
  });

  it('searches and returns results sorted by similarity', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();

    await adapter.upsert([
      makeEntry('c1', 'doc1', [1, 0, 0, 0], 'exact match'),
      makeEntry('c2', 'doc1', [0.9, 0.1, 0, 0], 'close match'),
      makeEntry('c3', 'doc2', [0, 1, 0, 0], 'no match'),
    ]);

    const results = await adapter.search([1, 0, 0, 0], 2);
    expect(results).toHaveLength(2);
    // First result should be the exact match (highest score)
    expect(results[0].entry.id).toBe('c1');
    expect(results[0].score).toBeCloseTo(1.0, 1);
    // Scores should be descending
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('search with documentIds filter', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();

    await adapter.upsert([
      makeEntry('c1', 'doc1', [1, 0, 0, 0], 'doc1 chunk'),
      makeEntry('c2', 'doc2', [1, 0, 0, 0], 'doc2 chunk'),
    ]);

    const results = await adapter.search([1, 0, 0, 0], 10, { documentIds: ['doc2'] });
    expect(results).toHaveLength(1);
    expect(results[0].entry.documentId).toBe('doc2');
  });

  it('deletes by document', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();

    await adapter.upsert([
      makeEntry('c1', 'doc1', [1, 0, 0, 0], 'a'),
      makeEntry('c2', 'doc1', [0, 1, 0, 0], 'b'),
      makeEntry('c3', 'doc2', [0, 0, 1, 0], 'c'),
    ]);

    await adapter.deleteByDocument('doc1');

    const stats = await adapter.stats();
    expect(stats.totalVectors).toBe(1);
    expect(stats.documentsIndexed).toBe(1);
  });

  it('close without error', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();
    await adapter.close();
  });

  it('round-trip: upsert then search returns correct metadata', async () => {
    const adapter = createSqliteVecAdapter(db, DIMS);
    await adapter.initialize();

    await adapter.upsert([
      makeEntry('chunk-1', 'doc-a', [1, 0, 0, 0], 'Important text about AI'),
    ]);

    const results = await adapter.search([1, 0, 0, 0], 1);
    expect(results).toHaveLength(1);
    expect(results[0].entry.metadata.text).toBe('Important text about AI');
    expect(results[0].entry.metadata.fileName).toBe('doc-a.txt');
    expect(results[0].entry.documentId).toBe('doc-a');
  });
});
