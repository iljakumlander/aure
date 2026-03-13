/**
 * sqlite-vec adapter.
 * Implements VectorDBAdapter using better-sqlite3 + sqlite-vec extension.
 */

import { statSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { VectorDBAdapter, VectorEntry, SearchResult, SearchFilter, DBStats } from '../types/index.js';
import { createSchema } from './schema.js';

/**
 * Normalize a vector to unit length for cosine similarity via L2 distance.
 */
function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return vector;
  return vector.map(x => x / norm);
}

/**
 * Convert L2 distance on normalized vectors to cosine similarity (0–1).
 * For unit vectors: L2² = 2 - 2·cos(θ), so cos_sim = 1 - L2²/2.
 */
function l2ToCosine(l2Distance: number): number {
  return Math.max(0, 1 - (l2Distance * l2Distance) / 2);
}

export function createSqliteVecAdapter(db: Database.Database, dimensions: number): VectorDBAdapter {
  let dbPath: string | undefined;

  return {
    async initialize(): Promise<void> {
      dbPath = db.name !== ':memory:' ? db.name : undefined;
      db.exec(createSchema(dimensions));
    },

    async upsert(entries: VectorEntry[]): Promise<void> {
      const insertVec = db.prepare(
        'INSERT INTO vec_chunks(embedding) VALUES (?)',
      );
      const insertMeta = db.prepare(
        `INSERT INTO chunk_metadata (id, document_id, file_path, file_name, page_number, section_heading, char_start, char_end, chunk_index, text, vec_rowid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const tx = db.transaction((entries: VectorEntry[]) => {
        for (const entry of entries) {
          const normalized = normalize(entry.vector);
          const vecResult = insertVec.run(JSON.stringify(normalized));
          const vecRowid = vecResult.lastInsertRowid;

          insertMeta.run(
            entry.id,
            entry.documentId,
            entry.metadata.filePath,
            entry.metadata.fileName,
            entry.metadata.pageNumber ?? null,
            entry.metadata.sectionHeading ?? null,
            entry.metadata.charStart,
            entry.metadata.charEnd,
            entry.metadata.chunkIndex,
            entry.metadata.text,
            vecRowid,
          );
        }
      });

      tx(entries);
    },

    async search(query: number[], topK: number, filter?: SearchFilter): Promise<SearchResult[]> {
      const normalized = normalize(query);
      const vecResults = db.prepare(
        'SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? ORDER BY distance LIMIT ?',
      ).all(JSON.stringify(normalized), topK * 2) as Array<{ rowid: number; distance: number }>;
      // Fetch extra to allow for post-filtering

      const getMeta = db.prepare(
        'SELECT * FROM chunk_metadata WHERE vec_rowid = ?',
      );

      const results: SearchResult[] = [];
      for (const row of vecResults) {
        const meta = getMeta.get(row.rowid) as {
          id: string;
          document_id: string;
          file_path: string;
          file_name: string;
          page_number: number | null;
          section_heading: string | null;
          char_start: number;
          char_end: number;
          chunk_index: number;
          text: string;
          vec_rowid: number;
        } | undefined;

        if (!meta) continue;

        // Apply filters
        if (filter?.documentIds && !filter.documentIds.includes(meta.document_id)) continue;
        if (filter?.fileTypes) {
          const ext = meta.file_name.slice(meta.file_name.lastIndexOf('.'));
          if (!filter.fileTypes.includes(ext)) continue;
        }

        results.push({
          entry: {
            id: meta.id,
            documentId: meta.document_id,
            vector: [], // Don't return vectors in search results (expensive)
            metadata: {
              filePath: meta.file_path,
              fileName: meta.file_name,
              pageNumber: meta.page_number ?? undefined,
              sectionHeading: meta.section_heading ?? undefined,
              charStart: meta.char_start,
              charEnd: meta.char_end,
              chunkIndex: meta.chunk_index,
              text: meta.text,
            },
          },
          score: l2ToCosine(row.distance),
        });

        if (results.length >= topK) break;
      }

      return results;
    },

    async deleteByDocument(documentId: string): Promise<void> {
      const tx = db.transaction((docId: string) => {
        const rows = db.prepare(
          'SELECT vec_rowid FROM chunk_metadata WHERE document_id = ?',
        ).all(docId) as Array<{ vec_rowid: number }>;

        for (const row of rows) {
          db.prepare('DELETE FROM vec_chunks WHERE rowid = ?').run(row.vec_rowid);
        }

        db.prepare('DELETE FROM chunk_metadata WHERE document_id = ?').run(docId);
      });

      tx(documentId);
    },

    async stats(): Promise<DBStats> {
      const totalVectors = (db.prepare('SELECT COUNT(*) as count FROM chunk_metadata').get() as { count: number }).count;
      const documentsIndexed = (db.prepare('SELECT COUNT(DISTINCT document_id) as count FROM chunk_metadata').get() as { count: number }).count;

      let storageSizeBytes = 0;
      if (dbPath) {
        try {
          storageSizeBytes = statSync(dbPath).size;
        } catch {
          // DB file may not exist yet
        }
      }

      return { totalVectors, documentsIndexed, storageSizeBytes };
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
