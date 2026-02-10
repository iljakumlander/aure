/**
 * Data source types — how aure finds knowledge to answer questions.
 *
 * aure doesn't prescribe the shape of your data.
 * CV, notes, blog drafts — it's all "data sources" that get
 * loaded, optionally chunked, and made available to the LLM.
 *
 * The private data repo has a flat structure:
 *   data/
 *     config.yaml     ← provider + server config
 *     persona.yaml    ← persona definition
 *     rules.yaml      ← keyword rules + spam rules
 *     notes/           ← markdown files (author's thoughts)
 *     cv/              ← CV data in any JSON structure
 *     assets/          ← images, logos, etc.
 *
 * Each data source is a directory or file that aure indexes.
 */

/** A loaded chunk of knowledge */
export interface DataChunk {
  /** Which source this came from */
  source: string;
  /** The actual content */
  content: string;
  /** Optional metadata for search relevance */
  metadata?: Record<string, unknown>;
}

/**
 * Data source definition in config.
 * Tells aure where to look and how to load.
 */
export interface DataSource {
  /** Unique name for this source */
  name: string;
  /** Relative path from data/ directory */
  path: string;
  /** How to interpret the files */
  format: 'markdown' | 'json' | 'text';
  /** Description for the LLM — what kind of data is this? */
  description: string;
}

/**
 * Top-level aure configuration (data/config.yaml).
 */
export interface AureConfig {
  /** Server settings */
  server: {
    port: number;
    host: string;
  };

  /** LLM provider */
  provider: import('./provider.js').LLMProvider;

  /** Data sources to index */
  sources: DataSource[];

  /** Admin panel settings */
  admin: {
    /** Simple token-based auth for admin panel */
    token: string;
  };
}
