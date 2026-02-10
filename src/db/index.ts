import Database from 'better-sqlite3';
import { SCHEMA } from './schema.js';
import { randomUUID } from 'node:crypto';
import type { Message, Conversation } from '../types/index.js';

let db: Database.Database;

export function initDatabase(path: string = 'aure.db'): Database.Database {
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ── Conversations ──────────────────────────────────────────

export function createConversation(visitorName?: string, visitorEmail?: string): Conversation {
  const id = randomUUID();
  const now = new Date().toISOString();

  getDatabase().prepare(`
    INSERT INTO conversations (id, visitor_name, visitor_email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, visitorName ?? null, visitorEmail ?? null, now, now);

  return {
    id,
    visitorName: visitorName ?? null,
    visitorEmail: visitorEmail ?? null,
    summary: null,
    tags: [],
    spam: false,
    seen: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function getConversation(id: string): Conversation | null {
  const row = getDatabase().prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).get(id) as any;

  return row ? rowToConversation(row) : null;
}

export function listConversations(opts: {
  includeSpam?: boolean;
  unseenOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}): Conversation[] {
  const conditions: string[] = [];

  if (!opts.includeSpam) {
    conditions.push('spam = 0');
  }
  if (opts.unseenOnly) {
    conditions.push('seen = 0');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = getDatabase().prepare(`
    SELECT * FROM conversations ${where}
    ORDER BY pinned DESC, updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  return rows.map(rowToConversation);
}

export function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'summary' | 'tags' | 'spam' | 'seen' | 'pinned' | 'visitorName' | 'visitorEmail'>>
): void {
  const sets: string[] = [];
  const params: any[] = [];

  if (updates.summary !== undefined) { sets.push('summary = ?'); params.push(updates.summary); }
  if (updates.tags !== undefined) { sets.push('tags = ?'); params.push(JSON.stringify(updates.tags)); }
  if (updates.spam !== undefined) { sets.push('spam = ?'); params.push(updates.spam ? 1 : 0); }
  if (updates.seen !== undefined) { sets.push('seen = ?'); params.push(updates.seen ? 1 : 0); }
  if (updates.pinned !== undefined) { sets.push('pinned = ?'); params.push(updates.pinned ? 1 : 0); }
  if (updates.visitorName !== undefined) { sets.push('visitor_name = ?'); params.push(updates.visitorName); }
  if (updates.visitorEmail !== undefined) { sets.push('visitor_email = ?'); params.push(updates.visitorEmail); }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  params.push(id);

  getDatabase().prepare(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`
  ).run(...params);
}

export function deleteConversation(id: string): void {
  getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

// ── Messages ───────────────────────────────────────────────

export function addMessage(
  conversationId: string,
  role: Message['role'],
  content: string,
  metadata?: Record<string, unknown>
): Message {
  const id = randomUUID();
  const now = new Date().toISOString();

  getDatabase().prepare(`
    INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, JSON.stringify(metadata ?? {}), now);

  // Touch the conversation's updated_at
  getDatabase().prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).run(conversationId);

  return {
    id,
    conversationId,
    role,
    content,
    status: 'received',
    createdAt: now,
    metadata,
  };
}

export function getMessages(conversationId: string, limit = 100): Message[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(conversationId, limit) as any[];

  return rows.map(rowToMessage);
}

export function updateMessageStatus(id: string, status: Message['status']): void {
  getDatabase().prepare(
    'UPDATE messages SET status = ? WHERE id = ?'
  ).run(status, id);
}

export function addPendingMessage(conversationId: string, role: Message['role']): Message {
  const id = randomUUID();
  const now = new Date().toISOString();

  getDatabase().prepare(`
    INSERT INTO messages (id, conversation_id, role, content, status, metadata, created_at)
    VALUES (?, ?, ?, '', 'pending', '{}', ?)
  `).run(id, conversationId, role, now);

  getDatabase().prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).run(conversationId);

  return {
    id,
    conversationId,
    role,
    content: '',
    status: 'pending',
    createdAt: now,
  };
}

export function resolvePendingMessage(
  id: string,
  content: string,
  status: Message['status'] = 'received',
  metadata?: Record<string, unknown>
): void {
  getDatabase().prepare(
    'UPDATE messages SET content = ?, status = ?, metadata = ? WHERE id = ?'
  ).run(content, status, JSON.stringify(metadata ?? {}), id);
}

export function getMessagesSince(conversationId: string, since: string, limit = 50): Message[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND created_at > ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(conversationId, since, limit) as any[];

  return rows.map(rowToMessage);
}

// ── Admin Sessions ─────────────────────────────────────────

export function recordAdminVisit(): string {
  const id = randomUUID();
  getDatabase().prepare(
    'INSERT INTO admin_sessions (id) VALUES (?)'
  ).run(id);
  return id;
}

export function getLastAdminVisit(): string | null {
  const row = getDatabase().prepare(
    'SELECT visited_at FROM admin_sessions ORDER BY visited_at DESC LIMIT 1'
  ).get() as any;
  return row?.visited_at ?? null;
}

// ── Row Mappers ────────────────────────────────────────────

function rowToConversation(row: any): Conversation {
  return {
    id: row.id,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    summary: row.summary,
    tags: JSON.parse(row.tags || '[]'),
    spam: !!row.spam,
    seen: !!row.seen,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}
