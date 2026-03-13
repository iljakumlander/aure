/**
 * Configuration types for Aure α.
 * Mirrors the YAML config structure with TypeScript types.
 */

export type PresetName = 'pi5' | 'm-series' | 'gpu' | 'custom';

export interface EmbeddingConfig {
  provider: 'ollama';
  model: string;
  baseUrl: string;
  dimensions: number;
  batchSize: number;
}

export interface VectorDBConfig {
  adapter: 'sqlite-vec' | 'lancedb' | 'qdrant';
  path?: string;
  url?: string;
}

export interface ChunkingConfig {
  strategy: 'semantic' | 'fixed';
  maxTokens: number;
  overlap: number;
  respectBoundaries: boolean;
}

export interface RetrievalConfig {
  topK: number;
  scoreThreshold: number;
  rerank: boolean;
}

export interface ReferenceConfig {
  path: string;
  watch: boolean;
  supportedTypes: string[];
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface LLMConfig {
  model: string;
}

/**
 * User-provided config from YAML. All sections optional —
 * preset defaults fill in missing values.
 */
export interface AlphaConfig {
  preset?: PresetName;
  embedding?: Partial<EmbeddingConfig>;
  vectordb?: Partial<VectorDBConfig>;
  chunking?: Partial<ChunkingConfig>;
  retrieval?: Partial<RetrievalConfig>;
  reference?: Partial<ReferenceConfig>;
  server?: Partial<ServerConfig>;
  llm?: Partial<LLMConfig>;
}

/**
 * Fully resolved config after merging with preset defaults.
 * Every field is guaranteed present.
 */
export interface ResolvedAlphaConfig {
  preset: PresetName;
  embedding: EmbeddingConfig;
  vectordb: VectorDBConfig;
  chunking: ChunkingConfig;
  retrieval: RetrievalConfig;
  reference: ReferenceConfig;
  server: ServerConfig;
  llm: LLMConfig;
}
