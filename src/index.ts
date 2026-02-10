/**
 * aure — autonomous auto-response engine.
 *
 * Entry point. Loads data, creates the responder,
 * starts the server. One process, one port.
 */

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve } from 'node:path';

import { initDatabase } from './db/index.js';
import { loadData } from './core/data-loader.js';
import { createResponder } from './core/responder.js';
import { createLLMAdapter } from './llm/index.js';
import { createAPI } from './server/api.js';

const DATA_DIR = process.env.AURE_DATA_DIR ?? resolve(process.cwd(), 'data');
const DB_PATH = process.env.AURE_DB_PATH ?? resolve(process.cwd(), 'aure.db');

async function main() {
  console.log('');
  console.log('  ┌─────────────────────────┐');
  console.log('  │         a u r e          │');
  console.log('  │   auto-response engine   │');
  console.log('  └─────────────────────────┘');
  console.log('');

  // 1. Load data
  console.log(`  data:  ${DATA_DIR}`);
  const data = loadData(DATA_DIR);

  // 2. Initialize database
  console.log(`  db:    ${DB_PATH}`);
  initDatabase(DB_PATH);

  // 3. Create LLM adapter
  const llm = createLLMAdapter(data.config.provider);
  console.log(`  llm:   ${llm.name}`);

  // Check LLM health
  const healthy = await llm.health();
  if (!healthy) {
    console.warn('  ⚠  LLM provider is not reachable. Responses will use fallback.');
  } else {
    console.log('  llm:   ✓ connected');
  }

  // 4. Create responder
  const responder = createResponder({
    persona: data.persona,
    rules: data.rules,
    spamRules: data.spamRules,
    chunks: data.chunks,
    llm,
  });

  // 5. Create server
  const app = new Hono();

  // Static files (frontend) — must be before API so `/` serves index.html
  const webRoot = resolve(process.cwd(), 'web', 'dist');
  console.log(`  web:   ${webRoot}`);
  app.use('/*', serveStatic({ root: './web/dist' }));

  // API routes
  const api = createAPI(responder, data.config.admin.token, llm);
  app.route('/', api);

  // Fallback to index.html for non-API, non-static paths
  app.get('*', serveStatic({ root: './web/dist', path: 'index.html' }));

  // 6. Start
  const port = data.config.server.port ?? 3000;
  const host = data.config.server.host ?? '0.0.0.0';

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  }, () => {
    console.log('');
    console.log(`  ✓ listening on http://${host}:${port}`);
    console.log(`  ✓ persona: ${data.persona.name}`);
    console.log(`  ✓ rules: ${data.rules.length} active, ${data.spamRules.length} spam filters`);
    console.log(`  ✓ data sources: ${data.chunks.length} chunks loaded`);
    console.log('');
  });
}

main().catch((error) => {
  console.error('Failed to start aure:', error);
  process.exit(1);
});
