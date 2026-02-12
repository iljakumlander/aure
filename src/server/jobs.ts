/**
 * Background job processor for async LLM responses.
 *
 * Supports message queuing: visitors can send multiple messages
 * while the LLM is processing. The job re-fetches all unresponded
 * visitor messages from DB before calling the LLM, so it always
 * sees the full queue. After responding, it checks for new messages
 * that arrived during processing and chains automatically.
 *
 * Jobs can be cancelled via cancelJob() — this aborts the Ollama fetch,
 * which causes Ollama to stop generation server-side.
 */

import type { SSEStreamingApi } from 'hono/streaming';
import type { createResponder } from '../core/responder.js';
import type { LLMMessage } from '../llm/provider.js';
import * as db from '../db/index.js';

type Responder = ReturnType<typeof createResponder>;

/** Active SSE connections per conversation */
const listeners = new Map<string, Set<SSEStreamingApi>>();

/** Active abort controllers per pending message */
const activeJobs = new Map<string, AbortController>();

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
 * Cancel a pending job. Aborts the Ollama fetch, which stops generation.
 * Returns true if a job was found and cancelled.
 */
export function cancelJob(pendingMessageId: string): boolean {
  const controller = activeJobs.get(pendingMessageId);
  if (!controller) return false;
  controller.abort();
  activeJobs.delete(pendingMessageId);
  return true;
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
 * Process queued visitor messages in the background.
 *
 * Re-fetches all unresponded visitor messages from DB (not just the
 * triggering message), builds history fresh, calls LLM.
 *
 * After responding, checks for new messages that arrived during
 * processing and chains into a new job automatically.
 */
export function processInBackground(
  pendingMessageId: string,
  conversationId: string,
  responder: Responder
): void {
  const controller = new AbortController();
  activeJobs.set(pendingMessageId, controller);

  void (async () => {
    const startTime = Date.now();
    try {
      // Re-fetch all queued visitor messages (captures any that arrived
      // between the API handler and now)
      const unresponded = db.getUnrespondedVisitorMessages(conversationId);

      if (unresponded.length === 0) {
        console.log(`[aure] No unresponded messages for ${pendingMessageId}, skipping`);
        db.resolvePendingMessage(pendingMessageId, '', 'error', { error: 'no messages' });
        return;
      }

      // Combine all queued messages into one question
      const combinedQuestion = unresponded.length === 1
        ? unresponded[0].content
        : unresponded.map(m => m.content).join('\n\n');

      // Build fresh history from DB
      const allMessages = db.getMessages(conversationId);
      const history: LLMMessage[] = allMessages
        .filter(m => m.status !== 'pending')
        .slice(-10)
        .map(m => ({
          role: m.role === 'visitor' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }));

      console.log(`[aure] Processing ${unresponded.length} queued message(s) for ${pendingMessageId} — calling LLM...`);
      const result = await responder.respond(combinedQuestion, history, controller.signal);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[aure] LLM responded in ${elapsed}s (source: ${result.source})`);

      // Race condition: cancel arrived while await was resolving
      if (controller.signal.aborted) {
        console.log(`[aure] Job ${pendingMessageId} cancelled (race: response arrived)`);
        db.resolvePendingMessage(pendingMessageId, '', 'error', { error: 'cancelled' });
        await notifyListeners(conversationId, 'cancelled', { id: pendingMessageId });
        return;
      }

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

      // Resolve with the actual response time (not placeholder creation time)
      const resolvedAt = db.resolvePendingMessage(pendingMessageId, result.content, 'received', {
        source: result.source,
      });

      await notifyListeners(conversationId, 'message', {
        id: pendingMessageId,
        role: 'aure',
        content: result.content,
        status: 'received',
        source: result.source,
        createdAt: resolvedAt,
      });

      // Chain: check if more visitor messages arrived during LLM processing
      const newUnresponded = db.getUnrespondedVisitorMessages(conversationId);
      if (newUnresponded.length > 0) {
        console.log(`[aure] ${newUnresponded.length} new message(s) arrived during processing, chaining...`);
        const newPending = db.addPendingMessage(conversationId, 'aure');

        await notifyListeners(conversationId, 'processing', {
          pendingMessageId: newPending.id,
        });

        // Chain into a new job (not recursion — fresh fire-and-forget)
        processInBackground(newPending.id, conversationId, responder);
      }
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (controller.signal.aborted) {
        console.log(`[aure] Job ${pendingMessageId} cancelled after ${elapsed}s`);
        db.resolvePendingMessage(pendingMessageId, '', 'error', { error: 'cancelled' });
        await notifyListeners(conversationId, 'cancelled', { id: pendingMessageId });
        return;
      }

      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      const errorType = isTimeout ? 'timeout' : 'error';
      console.error(`[aure] Background job failed after ${elapsed}s (${errorType}):`, error);

      db.resolvePendingMessage(pendingMessageId, '', 'error', {
        error: error instanceof Error ? error.message : String(error),
        type: errorType,
      });

      await notifyListeners(conversationId, 'error', {
        id: pendingMessageId,
        error: 'Failed to generate response',
        type: errorType,
      });
    } finally {
      activeJobs.delete(pendingMessageId);
    }
  })();
}
