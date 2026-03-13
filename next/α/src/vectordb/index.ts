/**
 * Vector DB factory.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { VectorDBAdapter } from '../types/index.js';
import type { VectorDBConfig } from '../types/config.js';
import { createSqliteVecAdapter } from './sqlite-vec.js';

export interface VectorDBHandle {
  adapter: VectorDBAdapter;
  db: Database.Database;
}

/**
 * Create and initialize a vector DB adapter.
 * Returns both the adapter and the underlying DB handle (for sharing with tracker).
 */
export async function createVectorDB(config: VectorDBConfig, dimensions: number): Promise<VectorDBHandle> {
  if (config.adapter !== 'sqlite-vec') {
    throw new Error(`Vector DB adapter "${config.adapter}" is not yet implemented`);
  }

  const dbPath = config.path ?? './aure-vectors.db';
  const db = new Database(dbPath);
  sqliteVec.load(db);

  const adapter = createSqliteVecAdapter(db, dimensions);
  await adapter.initialize();

  return { adapter, db };
}

export { createSqliteVecAdapter } from './sqlite-vec.js';
export { createSchema } from './schema.js';
