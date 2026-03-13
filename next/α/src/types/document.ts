/**
 * Document, chunk, and source attribution types for Aure α.
 * These define the data model for the RAG pipeline.
 */

export interface ChunkMetadata {
  filePath: string;
  fileName: string;
  pageNumber?: number;
  sectionHeading?: string;
  charStart: number;
  charEnd: number;
  chunkIndex: number;
  text: string;
}

export interface VectorEntry {
  id: string;
  documentId: string;
  vector: number[];
  metadata: ChunkMetadata;
}

export interface SearchResult {
  entry: VectorEntry;
  score: number;
}

export interface SearchFilter {
  documentIds?: string[];
  fileTypes?: string[];
}

export interface DBStats {
  totalVectors: number;
  documentsIndexed: number;
  storageSizeBytes: number;
}

export interface ParsedDocument {
  filePath: string;
  title?: string;
  sections: DocumentSection[];
  rawText: string;
  pageCount?: number;
}

export interface DocumentSection {
  heading?: string;
  content: string;
  pageNumber?: number;
  charStart: number;
  charEnd: number;
}

export interface RetrievalOptions {
  topK?: number;
  scoreThreshold?: number;
  documentFilter?: string[];
}

export interface RetrievalResult {
  chunk: ChunkMetadata;
  score: number;
  highlights: TextHighlight[];
}

export interface TextHighlight {
  text: string;
  start: number;
  end: number;
}

export interface RAGResponse {
  answer: string;
  sources: SourceCitation[];
  retrievalMeta: {
    chunksSearched: number;
    chunksUsed: number;
    queryEmbeddingTimeMs: number;
    searchTimeMs: number;
    totalTimeMs: number;
  };
}

export interface SourceCitation {
  documentId: string;
  fileName: string;
  filePath: string;
  pageNumber?: number;
  sectionHeading?: string;
  relevanceScore: number;
  highlightedText: string;
  context: string;
  charStart: number;
  charEnd: number;
}
