/**
 * Aure α — RAG engine.
 *
 * Library entry point. Import this to use α
 * as a module inside Aure v1 or any other system.
 */

// Config
export { loadConfig, mergeConfig, configExists, getPreset, PRESETS } from './config/index.js';

// Pipeline
export { createPipeline } from './ingestion/index.js';
export type { Pipeline, IngestOptions, IngestResult } from './ingestion/index.js';

// Components
export { createEmbedder } from './embedder/index.js';
export { createVectorDB } from './vectordb/index.js';
export { createChunker } from './chunker/index.js';
export { createDefaultParsers, getParserForFile } from './parsers/index.js';

// Retriever
export { createRetriever, extractHighlights, rerankByKeywordOverlap } from './retriever/index.js';
export type { RetrieverWithMeta, RetrievalMeta } from './retriever/index.js';

// Types
export type * from './types/index.js';
