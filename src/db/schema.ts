/**
 * SQLite schema for aure.
 *
 * Two core tables: conversations and messages.
 * WAL mode for concurrent reads (visitor chat + admin panel).
 */

export const SCHEMA = `
  -- Enable WAL mode for concurrent access
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    visitor_name  TEXT,
    visitor_email TEXT,
    summary       TEXT,
    tags          TEXT DEFAULT '[]',    -- JSON array of strings
    spam          INTEGER DEFAULT 0,
    seen          INTEGER DEFAULT 0,
    pinned        INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('visitor', 'aure')),
    content         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'read', 'archived', 'spam', 'pending', 'error')),
    metadata        TEXT DEFAULT '{}',  -- JSON object
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Index for fetching messages by conversation, newest first
  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, created_at DESC);

  -- Index for admin panel: unseen conversations first
  CREATE INDEX IF NOT EXISTS idx_conversations_unseen
    ON conversations(seen, updated_at DESC);

  -- Index for spam filtering
  CREATE INDEX IF NOT EXISTS idx_conversations_spam
    ON conversations(spam);

  -- Admin digest tracking — when was the last admin visit?
  CREATE TABLE IF NOT EXISTS admin_sessions (
    id         TEXT PRIMARY KEY,
    visited_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
