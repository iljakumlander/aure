/**
 * Background job processor for async LLM responses.
 *
 * When a visitor sends a message:
 * 1. API saves visitor msg, creates a pending aure msg, returns 202
 * 2. This module runs the LLM in the background (fire-and-forget promise)
 * 3. When done, saves result to DB and notifies any SSE listeners
 *
 * If no SSE listeners are connected, the result sits in the DB
 * and the visitor sees it next time they load the conversation.
 */

import type { SSEStreamingApi } from 'hono/streaming';
import type { createResponder } from '../core/responder.js';
import type { LLMMessage } from '../llm/provider.js';
import * as db from '../db/index.js';

type Responder = ReturnType<typeof createResponder>;

/** Active SSE connections per conversation */
const listeners = new Map<string, Set<SSEStreamingApi>>();

/**
 * Register an SSE stream for a conversation.
 * Returns a cleanup function to call when the stream closes.
 */
export function addListener(
  conversationId: string,
  stream: SSEStreamingApi
): () => void {
  if (!listeners.has(conversationId)) {
    listeners.set(conversationId, new Set());
  }
  listeners.get(conversationId)!.add(stream);

  return () => {
    const set = listeners.get(conversationId);
    if (set) {
      set.delete(stream);
      if (set.size === 0) listeners.delete(conversationId);
    }
  };
}

/**
 * Notify all SSE listeners for a conversation.
 */
async function notifyListeners(
  conversationId: string,
  event: string,
  data: unknown
): Promise<void> {
  const set = listeners.get(conversationId);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify(data);
  for (const stream of set) {
    try {
      await stream.writeSSE({ event, data: payload });
    } catch {
      set.delete(stream);
    }
  }
}

/**
 * Process a visitor message in the background.
 * Called fire-and-forget from the API handler.
 */
export function processInBackground(
  pendingMessageId: string,
  conversationId: string,
  visitorMessage: string,
  history: LLMMessage[],
  responder: Responder
): void {
  void (async () => {
    try {
      const result = await responder.respond(visitorMessage, history);

      if (result.drop) {
        db.updateConversation(conversationId, { spam: true });
        db.resolvePendingMessage(pendingMessageId, '', 'received');
        await notifyListeners(conversationId, 'message', {
          id: pendingMessageId, role: 'aure', content: '', status: 'received',
        });
        return;
      }

      if (result.spam) {
        db.updateConversation(conversationId, { spam: true });
      }

      db.resolvePendingMessage(pendingMessageId, result.content, 'received', {
        source: result.source,
      });

      await notifyListeners(conversationId, 'message', {
        id: pendingMessageId,
        role: 'aure',
        content: result.content,
        status: 'received',
        source: result.source,
      });
    } catch (error) {
      console.error('[aure] Background job failed:', error);

      db.resolvePendingMessage(pendingMessageId, '', 'error', {
        error: error instanceof Error ? error.message : String(error),
      });

      await notifyListeners(conversationId, 'error', {
        id: pendingMessageId,
        error: 'Failed to generate response',
      });
    }
  })();
}
