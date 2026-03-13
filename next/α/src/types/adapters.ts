/**
 * Adapter interfaces for Aure α.
 * Contracts for pluggable components — implemented in later phases.
 */

import type {
  VectorEntry,
  SearchResult,
  SearchFilter,
  DBStats,
  ParsedDocument,
  RetrievalOptions,
  RetrievalResult,
} from './document.js';

export interface VectorDBAdapter {
  initialize(): Promise<void>;
  upsert(entries: VectorEntry[]): Promise<void>;
  search(query: number[], topK: number, filter?: SearchFilter): Promise<SearchResult[]>;
  deleteByDocument(documentId: string): Promise<void>;
  stats(): Promise<DBStats>;
  close(): Promise<void>;
}

export interface DocumentParser {
  extensions: string[];
  parse(filePath: string): Promise<ParsedDocument>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
  modelId: string;
}

export interface Retriever {
  retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]>;
}
