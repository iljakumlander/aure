/**
 * Document tracker.
 * Tracks which files have been indexed, their content hashes,
 * and which embedding model was used.
 */

import type Database from 'better-sqlite3';
import type { Tracker, TrackerEntry } from '../types/tracker.js';

export function createTracker(db: Database.Database): Tracker {
  const getStmt = db.prepare('SELECT * FROM document_tracker WHERE file_path = ?');
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO document_tracker (id, file_path, content_hash, chunk_count, embedding_model, indexed_at, file_size, file_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const removeStmt = db.prepare('DELETE FROM document_tracker WHERE file_path = ?');
  const listStmt = db.prepare('SELECT * FROM document_tracker');
  const mismatchStmt = db.prepare('SELECT * FROM document_tracker WHERE embedding_model != ?');
  const clearStmt = db.prepare('DELETE FROM document_tracker');

  function rowToEntry(row: Record<string, unknown>): TrackerEntry {
    return {
      id: row.id as string,
      filePath: row.file_path as string,
      contentHash: row.content_hash as string,
      chunkCount: row.chunk_count as number,
      embeddingModel: row.embedding_model as string,
      indexedAt: row.indexed_at as string,
      fileSize: row.file_size as number,
      fileType: row.file_type as string,
    };
  }

  return {
    getDocument(filePath: string): TrackerEntry | undefined {
      const row = getStmt.get(filePath) as Record<string, unknown> | undefined;
      return row ? rowToEntry(row) : undefined;
    },

    setDocument(entry: TrackerEntry): void {
      upsertStmt.run(
        entry.id,
        entry.filePath,
        entry.contentHash,
        entry.chunkCount,
        entry.embeddingModel,
        entry.indexedAt,
        entry.fileSize,
        entry.fileType,
      );
    },

    removeDocument(filePath: string): void {
      removeStmt.run(filePath);
    },

    listDocuments(): TrackerEntry[] {
      const rows = listStmt.all() as Array<Record<string, unknown>>;
      return rows.map(rowToEntry);
    },

    getModelMismatch(currentModel: string): TrackerEntry[] {
      const rows = mismatchStmt.all(currentModel) as Array<Record<string, unknown>>;
      return rows.map(rowToEntry);
    },

    clear(): void {
      clearStmt.run();
    },
  };
}
