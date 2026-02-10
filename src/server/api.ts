/**
 * API routes for aure.
 *
 * Two audiences, two prefixes:
 *   /api/chat/*   — visitor-facing (public)
 *   /api/admin/*  — author-facing (token-protected)
 */

import { Hono } from 'hono';
import * as db from '../db/index.js';
import type { createResponder } from '../core/responder.js';
import type { LLMAdapter, LLMMessage } from '../llm/provider.js';

type Responder = ReturnType<typeof createResponder>;

export function createAPI(responder: Responder, adminToken: string, llm: LLMAdapter) {
  const api = new Hono();

  // ── Visitor routes ─────────────────────────────────────

  /** Start a new conversation */
  api.post('/api/chat/start', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const conversation = db.createConversation(body.name, body.email);

    const greeting = responder.greeting();
    db.addMessage(conversation.id, 'aure', greeting);

    return c.json({
      conversationId: conversation.id,
      greeting,
    });
  });

  /** Send a message in an existing conversation */
  api.post('/api/chat/:conversationId/message', async (c) => {
    const { conversationId } = c.req.param();
    const body = await c.req.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'Message is required' }, 400);
    }

    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    // Save the visitor's message
    db.addMessage(conversationId, 'visitor', message);

    // Build history from existing messages
    const existingMessages = db.getMessages(conversationId);
    const history: LLMMessage[] = existingMessages
      .slice(-10) // Last 10 messages for context
      .map(m => ({
        role: m.role === 'visitor' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

    // Generate response
    const result = await responder.respond(message, history);

    if (result.drop) {
      // Silently drop spam — but still acknowledge
      db.updateConversation(conversationId, { spam: true });
      return c.json({ response: '' });
    }

    if (result.spam) {
      db.updateConversation(conversationId, { spam: true });
    }

    // Save aure's response
    db.addMessage(conversationId, 'aure', result.content);

    return c.json({
      response: result.content,
      source: result.source,
    });
  });

  /** Get conversation history (for reconnecting visitors) */
  api.get('/api/chat/:conversationId', (c) => {
    const { conversationId } = c.req.param();
    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const messages = db.getMessages(conversationId);
    return c.json({ conversation, messages });
  });

  // ── Admin routes ───────────────────────────────────────

  /** Middleware: check admin token */
  const adminAuth = async (c: any, next: any) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (token !== adminToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };

  /** Get admin digest — summary since last visit */
  api.get('/api/admin/digest', adminAuth, async (c) => {
    const lastVisit = db.getLastAdminVisit();
    const conversations = db.listConversations({ includeSpam: false });

    // Record this visit
    db.recordAdminVisit();

    // Mark all as seen
    for (const conv of conversations.filter(c => !c.seen)) {
      db.updateConversation(conv.id, { seen: true });
    }

    return c.json({
      since: lastVisit,
      conversations,
      newCount: conversations.filter(c => !c.seen).length,
    });
  });

  /** List all conversations */
  api.get('/api/admin/conversations', adminAuth, (c) => {
    const includeSpam = c.req.query('spam') === 'true';
    const conversations = db.listConversations({ includeSpam });
    return c.json({ conversations });
  });

  /** Get a specific conversation with all messages */
  api.get('/api/admin/conversations/:id', adminAuth, (c) => {
    const conversation = db.getConversation(c.req.param('id'));
    if (!conversation) return c.json({ error: 'Not found' }, 404);

    const messages = db.getMessages(conversation.id);
    return c.json({ conversation, messages });
  });

  /** Update conversation (pin, mark spam, etc.) */
  api.patch('/api/admin/conversations/:id', adminAuth, async (c) => {
    const body = await c.req.json();
    db.updateConversation(c.req.param('id'), body);
    return c.json({ ok: true });
  });

  /** Delete conversation */
  api.delete('/api/admin/conversations/:id', adminAuth, (c) => {
    db.deleteConversation(c.req.param('id'));
    return c.json({ ok: true });
  });

  /** Health check */
  api.get('/api/health', async (c) => {
    const llmHealthy = await llm.health();
    return c.json({
      status: llmHealthy ? 'ok' : 'degraded',
      llm: llmHealthy ? 'connected' : 'unreachable',
      version: '0.1.0',
    });
  });

  return api;
}
