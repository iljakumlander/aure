/**
 * Chat database CRUD.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { CHAT_SCHEMA } from './schema.js';
import type { Conversation, Message, MessageRole, MessageStatus, SourceRef } from '../types/index.js';

export interface ChatDB {
  createConversation(title?: string): Conversation;
  getConversation(id: string): Conversation | null;
  listConversations(): Conversation[];

  addMessage(conversationId: string, role: MessageRole, content: string, status?: MessageStatus): Message;
  getMessage(id: string): Message | null;
  getMessages(conversationId: string): Message[];
  updateMessageContent(id: string, content: string): void;
  updateMessageStatus(id: string, status: MessageStatus): void;
  updateMessageSources(id: string, sources: SourceRef[]): void;
  getUnrespondedVisitorMessages(conversationId: string): Message[];

  close(): void;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  sources: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as MessageRole,
    content: row.content,
    status: row.status as MessageStatus,
    sources: JSON.parse(row.sources),
    createdAt: row.created_at,
  };
}

export function createChatDB(dbPath: string): ChatDB {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(CHAT_SCHEMA);

  const stmts = {
    insertConv: db.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)'),
    getConv: db.prepare('SELECT * FROM conversations WHERE id = ?'),
    listConvs: db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC'),
    touchConv: db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"),

    insertMsg: db.prepare('INSERT INTO messages (id, conversation_id, role, content, status) VALUES (?, ?, ?, ?, ?)'),
    getMsg: db.prepare('SELECT * FROM messages WHERE id = ?'),
    getMsgs: db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'),
    updateContent: db.prepare('UPDATE messages SET content = ? WHERE id = ?'),
    updateStatus: db.prepare('UPDATE messages SET status = ? WHERE id = ?'),
    updateSources: db.prepare('UPDATE messages SET sources = ? WHERE id = ?'),
    getUnresponded: db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND role = 'visitor'
        AND created_at > COALESCE(
          (SELECT MAX(created_at) FROM messages WHERE conversation_id = ? AND role = 'assistant' AND status = 'done'),
          '1970-01-01'
        )
      ORDER BY created_at ASC
    `),
  };

  return {
    createConversation(title = 'New conversation') {
      const id = randomUUID();
      stmts.insertConv.run(id, title);
      return rowToConversation(stmts.getConv.get(id) as ConversationRow);
    },

    getConversation(id) {
      const row = stmts.getConv.get(id) as ConversationRow | undefined;
      return row ? rowToConversation(row) : null;
    },

    listConversations() {
      return (stmts.listConvs.all() as ConversationRow[]).map(rowToConversation);
    },

    addMessage(conversationId, role, content, status = 'done') {
      const id = randomUUID();
      stmts.insertMsg.run(id, conversationId, role, content, status);
      stmts.touchConv.run(conversationId);
      return rowToMessage(stmts.getMsg.get(id) as MessageRow);
    },

    getMessage(id) {
      const row = stmts.getMsg.get(id) as MessageRow | undefined;
      return row ? rowToMessage(row) : null;
    },

    getMessages(conversationId) {
      return (stmts.getMsgs.all(conversationId) as MessageRow[]).map(rowToMessage);
    },

    updateMessageContent(id, content) {
      stmts.updateContent.run(content, id);
    },

    updateMessageStatus(id, status) {
      stmts.updateStatus.run(status, id);
    },

    updateMessageSources(id, sources) {
      stmts.updateSources.run(JSON.stringify(sources), id);
    },

    getUnrespondedVisitorMessages(conversationId) {
      return (stmts.getUnresponded.all(conversationId, conversationId) as MessageRow[]).map(rowToMessage);
    },

    close() {
      db.close();
    },
  };
}
