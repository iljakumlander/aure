/**
 * `aure ingest` command.
 * Processes documents in reference/ and stores vectors.
 */

import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { createPipeline } from '../ingestion/pipeline.js';

export const ingestCommand = defineCommand({
  meta: {
    name: 'ingest',
    description: 'Process all new/changed files in reference/',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
    force: {
      type: 'boolean',
      description: 'Re-embed everything regardless of changes',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Show what would be processed without storing',
      default: false,
    },
    watch: {
      type: 'boolean',
      description: 'Watch for changes (not yet implemented)',
      default: false,
    },
  },
  async run({ args }) {
    const configPath = resolve(args.config);
    const config = loadConfig(configPath);
    const dryRun = args['dry-run'];

    console.log('');
    console.log('  Aure α — Ingestion');
    console.log('');
    console.log(`  Config:     ${configPath}`);
    console.log(`  Reference:  ${config.reference.path}`);
    console.log(`  Embedding:  ${config.embedding.model} (${config.embedding.dimensions}d)`);
    console.log(`  Vector DB:  ${config.vectordb.adapter}`);
    if (dryRun) console.log('  Mode:       dry-run');
    if (args.force) console.log('  Mode:       force re-embed');
    console.log('');

    if (args.watch) {
      console.log('  Watch mode is not yet implemented (planned for Phase 5).');
      console.log('');
      return;
    }

    const startTime = Date.now();
    const pipeline = createPipeline(config);

    try {
      const result = await pipeline.ingest({
        force: args.force,
        dryRun,
        onProgress: (current, total, file) => {
          console.log(`  [${current}/${total}] ${dryRun ? 'Would process' : 'Ingesting'} ${file}...`);
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('');
      console.log(`  ${dryRun ? 'Dry run' : 'Ingestion'} complete`);
      console.log(`  Processed: ${result.processed} files`);
      console.log(`  Skipped:   ${result.skipped} files (unchanged)`);
      console.log(`  Removed:   ${result.removed} files`);
      if (!dryRun) {
        console.log(`  Chunks:    ${result.totalChunks}`);
      }
      console.log(`  Time:      ${elapsed}s`);

      if (result.errors.length > 0) {
        console.log('');
        console.log(`  Errors (${result.errors.length}):`);
        for (const err of result.errors) {
          console.log(`    ${err.file}: ${err.error}`);
        }
      }
      console.log('');
    } finally {
      await pipeline.close();
    }
  },
});
