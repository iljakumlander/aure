/**
 * Job processor — manages background response generation.
 * Handles cancellation and auto-chaining of queued messages.
 */

import type { Responder } from './responder.js';
import type { ChatDB } from '../db/index.js';

export interface JobProcessor {
  enqueue(conversationId: string): void;
  cancel(conversationId: string): void;
}

export function createJobProcessor(responder: Responder, chatDB: ChatDB): JobProcessor {
  const activeJobs = new Map<string, AbortController>();

  async function run(conversationId: string) {
    const controller = new AbortController();
    activeJobs.set(conversationId, controller);

    try {
      await responder.respond(conversationId, controller.signal);
    } finally {
      activeJobs.delete(conversationId);
    }

    // Auto-chain: if new visitor messages arrived during processing, run again
    const pending = chatDB.getUnrespondedVisitorMessages(conversationId);
    if (pending.length > 0 && !controller.signal.aborted) {
      run(conversationId);
    }
  }

  return {
    enqueue(conversationId) {
      // If already processing this conversation, the auto-chain will pick it up
      if (activeJobs.has(conversationId)) return;
      run(conversationId);
    },

    cancel(conversationId) {
      const controller = activeJobs.get(conversationId);
      if (controller) {
        controller.abort();
        activeJobs.delete(conversationId);
      }
    },
  };
}
