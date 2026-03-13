/**
 * Document tracker types.
 * Tracks which files have been indexed and with which model.
 */

export interface TrackerEntry {
  id: string;
  filePath: string;
  contentHash: string;
  chunkCount: number;
  embeddingModel: string;
  indexedAt: string;
  fileSize: number;
  fileType: string;
}

export interface Tracker {
  getDocument(filePath: string): TrackerEntry | undefined;
  setDocument(entry: TrackerEntry): void;
  removeDocument(filePath: string): void;
  listDocuments(): TrackerEntry[];
  getModelMismatch(currentModel: string): TrackerEntry[];
  clear(): void;
}
