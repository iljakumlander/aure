/**
 * SQL schema for Aure α vector database.
 * Creates vec0 virtual table, metadata table, and document tracker.
 */

export function createSchema(dimensions: number): string {
  return `
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding float[${dimensions}]
    );

    CREATE TABLE IF NOT EXISTS chunk_metadata (
      id              TEXT PRIMARY KEY,
      document_id     TEXT NOT NULL,
      file_path       TEXT NOT NULL,
      file_name       TEXT NOT NULL,
      page_number     INTEGER,
      section_heading TEXT,
      char_start      INTEGER NOT NULL,
      char_end        INTEGER NOT NULL,
      chunk_index     INTEGER NOT NULL,
      text            TEXT NOT NULL,
      vec_rowid       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunk_document ON chunk_metadata(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunk_vec_rowid ON chunk_metadata(vec_rowid);

    CREATE TABLE IF NOT EXISTS document_tracker (
      id              TEXT PRIMARY KEY,
      file_path       TEXT NOT NULL UNIQUE,
      content_hash    TEXT NOT NULL,
      chunk_count     INTEGER NOT NULL,
      embedding_model TEXT NOT NULL,
      indexed_at      TEXT NOT NULL,
      file_size       INTEGER NOT NULL,
      file_type       TEXT NOT NULL
    );
  `;
}
