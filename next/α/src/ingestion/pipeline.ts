/**
 * Ingestion pipeline orchestrator.
 * Coordinates: scan → hash → parse → chunk → embed → store.
 */

import { resolve, relative, extname } from 'node:path';
import { statSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { ResolvedAlphaConfig } from '../types/config.js';
import type { Embedder, VectorDBAdapter, VectorEntry } from '../types/index.js';
import type { Tracker, TrackerEntry } from '../types/tracker.js';
import { createSqliteVecAdapter } from '../vectordb/sqlite-vec.js';
import { createSchema } from '../vectordb/schema.js';
import { createEmbedder } from '../embedder/index.js';
import { createChunker, type Chunker } from '../chunker/index.js';
import { createDefaultParsers, getParserForFile } from '../parsers/index.js';
import { createTracker } from './tracker.js';
import { scanDirectory } from './scanner.js';
import { hashFile, hashString } from './hasher.js';

export interface IngestOptions {
  force?: boolean;
  dryRun?: boolean;
  onProgress?: (current: number, total: number, file: string) => void;
}

export interface IngestResult {
  processed: number;
  skipped: number;
  removed: number;
  errors: Array<{ file: string; error: string }>;
  totalChunks: number;
}

export interface Pipeline {
  ingest(options?: IngestOptions): Promise<IngestResult>;
  close(): Promise<void>;
}

export function createPipeline(config: ResolvedAlphaConfig, overrides?: { embedder?: Embedder }): Pipeline {
  const dbPath = resolve(config.vectordb.path ?? './aure-vectors.db');
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.exec(createSchema(config.embedding.dimensions));

  const vectorDB = createSqliteVecAdapter(db, config.embedding.dimensions);
  const tracker = createTracker(db);
  const chunker = createChunker(config.chunking);
  const parsers = createDefaultParsers();
  const embedder = overrides?.embedder ?? createEmbedder(config.embedding);

  return {
    async ingest(options?: IngestOptions): Promise<IngestResult> {
      await vectorDB.initialize();

      const refPath = resolve(config.reference.path);
      if (!existsSync(refPath)) {
        throw new Error(`Reference directory not found: ${refPath}`);
      }

      const result: IngestResult = {
        processed: 0,
        skipped: 0,
        removed: 0,
        errors: [],
        totalChunks: 0,
      };

      // Check for model mismatch
      const force = options?.force ?? false;
      const dryRun = options?.dryRun ?? false;
      const mismatched = tracker.getModelMismatch(config.embedding.model);
      const forceReindex = force || mismatched.length > 0;

      // Scan for files
      const files = scanDirectory(refPath, config.reference.supportedTypes);
      const currentPaths = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const relativePath = relative(refPath, filePath);
        currentPaths.add(relativePath);

        options?.onProgress?.(i + 1, files.length, relativePath);

        try {
          // Check if file needs processing
          const contentHash = hashFile(filePath);
          const tracked = tracker.getDocument(relativePath);

          if (tracked && tracked.contentHash === contentHash && !forceReindex) {
            result.skipped++;
            result.totalChunks += tracked.chunkCount;
            continue;
          }

          if (dryRun) {
            result.processed++;
            continue;
          }

          // Select parser
          const parser = getParserForFile(filePath, parsers);
          if (!parser) {
            result.errors.push({ file: relativePath, error: `No parser for extension ${extname(filePath)}` });
            continue;
          }

          // Parse
          const parsed = await parser.parse(filePath);

          // Chunk
          const chunks = chunker.chunk(parsed);
          if (chunks.length === 0) {
            result.skipped++;
            continue;
          }

          // Delete old vectors if re-indexing
          const documentId = hashString(relativePath);
          if (tracked) {
            await vectorDB.deleteByDocument(documentId);
          }

          // Embed in batches
          const texts = chunks.map(c => c.text);
          const vectors = await embedder.embedBatch(texts);

          // Build VectorEntry list
          const entries: VectorEntry[] = chunks.map((chunk, idx) => ({
            id: `${documentId}-${idx}`,
            documentId,
            vector: vectors[idx],
            metadata: chunk,
          }));

          // Store
          await vectorDB.upsert(entries);

          // Update tracker
          const fileStats = statSync(filePath);
          const trackerEntry: TrackerEntry = {
            id: hashString(relativePath),
            filePath: relativePath,
            contentHash,
            chunkCount: chunks.length,
            embeddingModel: config.embedding.model,
            indexedAt: new Date().toISOString(),
            fileSize: fileStats.size,
            fileType: extname(filePath),
          };
          tracker.setDocument(trackerEntry);

          result.processed++;
          result.totalChunks += chunks.length;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push({ file: relativePath, error: message });
        }
      }

      // Remove files that no longer exist
      const trackedDocs = tracker.listDocuments();
      for (const doc of trackedDocs) {
        if (!currentPaths.has(doc.filePath)) {
          if (!dryRun) {
            const documentId = hashString(doc.filePath);
            await vectorDB.deleteByDocument(documentId);
            tracker.removeDocument(doc.filePath);
          }
          result.removed++;
        }
      }

      return result;
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
