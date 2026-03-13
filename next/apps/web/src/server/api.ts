/**
 * Hono API routes.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { stream } from 'hono/streaming';
import type { ChatDB } from '../db/index.js';
import type { SSEManager } from './sse.js';
import type { JobProcessor } from '../chat/jobs.js';
import type { LLMAdapter } from '../llm/types.js';
import type { Persona } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../../public');

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.epub': 'application/epub+zip',
};

export interface APIDeps {
  chatDB: ChatDB;
  sse: SSEManager;
  jobs: JobProcessor;
  llm: LLMAdapter;
  persona: Persona;
  referencePath: string;
}

export function createAPI(deps: APIDeps): Hono {
  const { chatDB, sse, jobs, llm, persona, referencePath } = deps;
  const app = new Hono();

  // Health check
  app.get('/api/health', async (c) => {
    const ollamaUp = await llm.isAvailable();
    return c.json({ status: ollamaUp ? 'ok' : 'degraded', ollama: ollamaUp });
  });

  // Create conversation
  app.post('/api/conversations', (c) => {
    const conv = chatDB.createConversation();

    // Add greeting as first message
    chatDB.addMessage(conv.id, 'assistant', persona.greeting, 'done');

    return c.json(conv, 201);
  });

  // Get conversation with messages
  app.get('/api/conversations/:id', (c) => {
    const conv = chatDB.getConversation(c.req.param('id'));
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const messages = chatDB.getMessages(conv.id);
    return c.json({ ...conv, messages });
  });

  // Send message
  app.post('/api/conversations/:id/messages', async (c) => {
    const convId = c.req.param('id');
    const conv = chatDB.getConversation(convId);
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json<{ content: string }>();
    if (!body.content?.trim()) return c.json({ error: 'Empty message' }, 400);

    const message = chatDB.addMessage(convId, 'visitor', body.content.trim());

    // Enqueue response generation
    jobs.enqueue(convId);

    return c.json(message, 201);
  });

  // Cancel pending response
  app.post('/api/conversations/:id/cancel', (c) => {
    const convId = c.req.param('id');
    const conv = chatDB.getConversation(convId);
    if (!conv) return c.json({ error: 'Not found' }, 404);

    jobs.cancel(convId);
    return c.json({ cancelled: true });
  });

  // SSE stream
  app.get('/api/conversations/:id/stream', (c) => {
    const convId = c.req.param('id');
    const conv = chatDB.getConversation(convId);
    if (!conv) return c.json({ error: 'Not found' }, 404);

    const stream = new ReadableStream({
      start(controller) {
        const client = sse.createClient(controller);
        sse.register(convId, client);

        // Send keepalive comment
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(': connected\n\n'));

        // Cleanup on close
        c.req.raw.signal.addEventListener('abort', () => {
          sse.unregister(convId, client);
          client.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });

  // Serve reference files (source documents)
  app.get('/api/reference/*', (c) => {
    const filePath = c.req.path.replace('/api/reference/', '');
    const decoded = decodeURIComponent(filePath);

    // Prevent path traversal
    if (decoded.includes('..')) return c.json({ error: 'Invalid path' }, 400);

    const fullPath = resolve(referencePath, decoded);
    if (!fullPath.startsWith(referencePath)) return c.json({ error: 'Invalid path' }, 400);
    if (!existsSync(fullPath)) return c.json({ error: 'Not found' }, 404);

    const stat = statSync(fullPath);
    const ext = decoded.substring(decoded.lastIndexOf('.'));
    const mime = MIME_TYPES[ext] ?? 'application/octet-stream';

    const nodeStream = createReadStream(fullPath);
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': mime,
        'Content-Length': stat.size.toString(),
        'Content-Disposition': ext === '.pdf' ? 'inline' : `inline; filename="${decoded}"`,
      },
    });
  });

  // Static files
  app.use('/*', serveStatic({ root: publicDir }));

  return app;
}
