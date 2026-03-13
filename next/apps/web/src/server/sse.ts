/**
 * SSE manager — per-conversation event streaming.
 */

export type SSEEvent =
  | { event: 'message:start'; data: { messageId: string } }
  | { event: 'message:token'; data: { messageId: string; token: string } }
  | { event: 'message:done'; data: { messageId: string; content: string; sources: unknown[] } }
  | { event: 'message:error'; data: { messageId: string; error: string } }
  | { event: 'message:cancelled'; data: { messageId: string } };

interface SSEClient {
  send(event: SSEEvent): void;
  close(): void;
}

export interface SSEManager {
  register(conversationId: string, client: SSEClient): void;
  unregister(conversationId: string, client: SSEClient): void;
  send(conversationId: string, event: SSEEvent): void;
  createClient(controller: ReadableStreamDefaultController<Uint8Array>): SSEClient;
}

export function createSSEManager(): SSEManager {
  const clients = new Map<string, Set<SSEClient>>();
  const encoder = new TextEncoder();

  return {
    register(conversationId, client) {
      let set = clients.get(conversationId);
      if (!set) {
        set = new Set();
        clients.set(conversationId, set);
      }
      set.add(client);
    },

    unregister(conversationId, client) {
      const set = clients.get(conversationId);
      if (set) {
        set.delete(client);
        if (set.size === 0) clients.delete(conversationId);
      }
    },

    send(conversationId, event) {
      const set = clients.get(conversationId);
      if (!set) return;
      for (const client of set) {
        try {
          client.send(event);
        } catch {
          set.delete(client);
        }
      }
    },

    createClient(controller) {
      return {
        send(event) {
          const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        },
        close() {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        },
      };
    },
  };
}
