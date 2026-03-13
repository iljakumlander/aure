/**
 * Aure Web — server entry point.
 * Loads α config, initializes RAG components, starts HTTP server.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  loadConfig,
  createEmbedder,
  createVectorDB,
  createRetriever,
} from '../../../α/src/index.js';
import { createChatDB } from './db/index.js';
import { loadPersona } from './persona/loader.js';
import { createOllamaAdapter } from './llm/ollama.js';
import { createSSEManager } from './server/sse.js';
import { createResponder } from './chat/responder.js';
import { createJobProcessor } from './chat/jobs.js';
import { createAPI } from './server/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Load α config — resolve from the α directory
  const alphaDir = resolve(__dirname, '../../../α');
  const config = loadConfig(resolve(alphaDir, 'config.yaml'));

  console.log(`[aure] Preset: ${config.preset}`);
  console.log(`[aure] Embedding: ${config.embedding.model} (${config.embedding.dimensions}d)`);
  console.log(`[aure] LLM: ${config.llm.model}`);

  // Initialize RAG components — resolve vector DB path relative to α directory
  const embedder = createEmbedder(config.embedding);
  const vectordbConfig = {
    ...config.vectordb,
    path: resolve(alphaDir, config.vectordb.path ?? './aure-vectors.db'),
  };
  const { adapter, db: vectorDB } = await createVectorDB(vectordbConfig, config.embedding.dimensions);
  await adapter.initialize();

  console.log(`[aure] Vector DB: ${vectordbConfig.path}`);

  const retriever = createRetriever(embedder, adapter, config.retrieval);

  // Initialize chat components
  const webDir = resolve(__dirname, '..');
  const chatDBPath = resolve(webDir, 'aure-chat.db');
  const chatDB = createChatDB(chatDBPath);

  const persona = loadPersona(webDir);
  const llm = createOllamaAdapter(config.embedding.baseUrl, config.llm.model);
  const sseManager = createSSEManager();

  const responder = createResponder({
    chatDB,
    retriever,
    llm,
    sse: sseManager,
    persona,
  });

  const jobs = createJobProcessor(responder, chatDB);

  const referencePath = resolve(alphaDir, config.reference.path);

  const api = createAPI({
    chatDB,
    sse: sseManager,
    jobs,
    llm,
    persona,
    referencePath,
  });

  // Start server
  const port = config.server.port;
  const host = config.server.host;

  console.log(`[aure] Persona: ${persona.name}`);
  console.log(`[aure] Chat DB: ${chatDBPath}`);
  console.log(`[aure] Starting server on http://${host}:${port}`);

  serve({ fetch: api.fetch, port, hostname: host }, (info) => {
    console.log(`[aure] Server ready at http://${host}:${info.port}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[aure] Shutting down...');
    chatDB.close();
    vectorDB.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[aure] Fatal:', err);
  process.exit(1);
});
