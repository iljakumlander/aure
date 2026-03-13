/**
 * `aure status` command.
 * Shows current config and index stats.
 */

import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { loadConfig, configExists } from '../config/loader.js';
import { createSqliteVecAdapter } from '../vectordb/sqlite-vec.js';
import { createTracker } from '../ingestion/tracker.js';
import { createSchema } from '../vectordb/schema.js';

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show index stats, config, and model info',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);

    if (!configExists(configPath)) {
      console.error(`Config not found: ${configPath}`);
      console.error('Run `aure init` first to create a config.');
      process.exit(1);
    }

    const config = loadConfig(configPath);
    const dbPath = resolve(config.vectordb.path ?? './aure-vectors.db');

    console.log('');
    console.log('  Aure α — Status');
    console.log('');
    console.log(`  Config:     ${configPath}`);
    console.log(`  Preset:     ${config.preset}`);
    console.log(`  Embedding:  ${config.embedding.model} (${config.embedding.dimensions}d)`);
    console.log(`  Vector DB:  ${config.vectordb.adapter}`);
    console.log(`  Chunking:   ${config.chunking.strategy}, ${config.chunking.maxTokens} tokens, overlap ${config.chunking.overlap}`);
    console.log(`  Reference:  ${config.reference.path}`);

    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        sqliteVec.load(db);
        db.exec(createSchema(config.embedding.dimensions));

        const adapter = createSqliteVecAdapter(db, config.embedding.dimensions);
        await adapter.initialize();
        const stats = await adapter.stats();

        const tracker = createTracker(db);
        const docs = tracker.listDocuments();
        const lastIngestion = docs.length > 0
          ? docs.reduce((latest, d) => d.indexedAt > latest ? d.indexedAt : latest, '')
          : undefined;

        console.log(`  Documents:  ${stats.documentsIndexed}`);
        console.log(`  Chunks:     ${stats.totalVectors}`);
        console.log(`  DB size:    ${(stats.storageSizeBytes / 1024).toFixed(1)} KB`);
        if (lastIngestion) {
          console.log(`  Last ingest: ${lastIngestion}`);
        }

        db.close();
      } catch {
        console.log('  Documents:  (error reading database)');
        console.log('  Chunks:     (error reading database)');
      }
    } else {
      console.log('  Documents:  (not indexed yet)');
      console.log('  Chunks:     (not indexed yet)');
    }
    console.log('');
  },
});
