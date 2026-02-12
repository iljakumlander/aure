/**
 * API routes for aure.
 *
 * Two audiences, two prefixes:
 *   /api/chat/*   — visitor-facing (public)
 *   /api/admin/*  — author-facing (token-protected)
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as db from '../db/index.js';
import type { createResponder } from '../core/responder.js';
import type { LLMAdapter } from '../llm/provider.js';
import { addListener, processInBackground, cancelJob } from './jobs.js';

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

  /** Send a message in an existing conversation.
   *  Non-blocking: visitors can send multiple messages while LLM processes.
   *  Returns 200+received (instant rule match), 200+queued (LLM already working),
   *  or 202+pending (LLM job started). */
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
    const visitorMsg = db.addMessage(conversationId, 'visitor', message);

    // Fast path: spam check (instant, no LLM)
    const spam = responder.checkSpam(message);
    if (spam) {
      db.updateConversation(conversationId, { spam: true });
      if (spam.action === 'drop') {
        return c.json({ messageId: null, status: 'dropped' });
      }
      const aureMsg = db.addMessage(conversationId, 'aure', responder.persona.fallback);
      return c.json({ messageId: aureMsg.id, status: 'received', response: responder.persona.fallback });
    }

    // Fast path: keyword rules (instant, no LLM)
    const rule = responder.checkRules(message);
    if (rule) {
      const aureMsg = db.addMessage(conversationId, 'aure', rule.response);
      return c.json({ messageId: aureMsg.id, status: 'received', response: rule.response });
    }

    // Check if LLM is already processing for this conversation
    const existing = db.hasPendingAureMessage(conversationId);
    if (existing) {
      // LLM already working — message is saved, it'll be picked up
      return c.json({
        messageId: visitorMsg.id,
        status: 'queued',
        pendingMessageId: existing.id,
      });
    }

    // Slow path: start LLM processing (jobs.ts re-fetches all queued messages)
    const pendingMsg = db.addPendingMessage(conversationId, 'aure');

    processInBackground(
      pendingMsg.id,
      conversationId,
      responder
    );

    return c.json({ messageId: pendingMsg.id, status: 'pending' }, 202);
  });

  /** SSE stream for real-time updates on a conversation */
  api.get('/api/chat/:conversationId/events', (c) => {
    const { conversationId } = c.req.param();
    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    return streamSSE(c, async (stream) => {
      const removeListener = addListener(conversationId, stream);

      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ conversationId }),
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: '' });
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      try {
        await new Promise<void>((resolve) => {
          stream.onAbort(() => resolve());
        });
      } finally {
        clearInterval(heartbeat);
        removeListener();
      }
    });
  });

  /** Cancel a pending response — aborts Ollama generation */
  api.delete('/api/chat/:conversationId/pending', (c) => {
    const { conversationId } = c.req.param();
    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const messages = db.getMessages(conversationId);
    const pending = messages.find(m => m.status === 'pending');
    if (!pending) {
      return c.json({ error: 'No pending message' }, 404);
    }

    const cancelled = cancelJob(pending.id);
    if (!cancelled) {
      // Job finished between our check and cancel attempt
      return c.json({ error: 'Job already completed' }, 409);
    }

    return c.json({ ok: true, messageId: pending.id });
  });

  /** Poll for messages (fallback, or catch-up after reconnect) */
  api.get('/api/chat/:conversationId/messages', (c) => {
    const { conversationId } = c.req.param();
    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const after = c.req.query('after');
    const messages = after
      ? db.getMessagesSince(conversationId, after)
      : db.getMessages(conversationId);

    return c.json({ messages });
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

    db.recordAdminVisit();

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
