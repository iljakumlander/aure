/**
 * `aure search` command.
 * Tests retrieval without LLM — shows matched chunks, scores, sources.
 */

import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig, configExists } from '../config/loader.js';
import { createEmbedder } from '../embedder/index.js';
import { createVectorDB } from '../vectordb/index.js';
import { createRetriever } from '../retriever/index.js';

export const searchCommand = defineCommand({
  meta: {
    name: 'search',
    description: 'Search indexed documents (retrieval without LLM)',
  },
  args: {
    query: {
      type: 'positional',
      description: 'Search query text',
      required: true,
    },
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
    'top-k': {
      type: 'string',
      description: 'Number of results to return',
    },
    threshold: {
      type: 'string',
      description: 'Minimum similarity score (0-1)',
    },
    json: {
      type: 'boolean',
      description: 'Output results as JSON',
      default: false,
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

    if (!existsSync(dbPath)) {
      console.error('No indexed documents found. Run `aure ingest` first.');
      process.exit(1);
    }

    const query = args.query as string;
    const embedder = createEmbedder(config.embedding);
    const { adapter, db } = await createVectorDB(config.vectordb, config.embedding.dimensions);
    await adapter.initialize();

    const retriever = createRetriever(embedder, adapter, config.retrieval);

    const options: { topK?: number; scoreThreshold?: number } = {};
    if (args['top-k']) options.topK = parseInt(args['top-k'], 10);
    if (args.threshold) options.scoreThreshold = parseFloat(args.threshold);

    try {
      const results = await retriever.retrieve(query, options);
      const meta = retriever.lastRetrievalMeta();

      if (args.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log('');
      console.log('  Aure α — Search');
      console.log('');
      console.log(`  Query:    "${query}"`);

      if (meta) {
        console.log(`  Results:  ${results.length} chunks (embed: ${meta.queryEmbeddingTimeMs}ms, search: ${meta.searchTimeMs}ms)`);
      } else {
        console.log(`  Results:  ${results.length} chunks`);
      }
      console.log('');

      if (results.length === 0) {
        console.log('  No results found above threshold.');
        console.log('');
        return;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const heading = r.chunk.sectionHeading ? ` § ${r.chunk.sectionHeading}` : '';
        const page = r.chunk.pageNumber ? ` p.${r.chunk.pageNumber}` : '';
        console.log(`  [${i + 1}] ${r.score.toFixed(2)}  ${r.chunk.fileName}${heading}${page}`);

        const preview = r.chunk.text.slice(0, 120).replace(/\n/g, ' ');
        console.log(`      "${preview}${r.chunk.text.length > 120 ? '...' : ''}"`);

        if (r.highlights.length > 0) {
          const terms = r.highlights.map(h => h.text).join(', ');
          console.log(`      Highlights: ${terms}`);
        }
        console.log('');
      }
    } finally {
      db.close();
    }
  },
});
