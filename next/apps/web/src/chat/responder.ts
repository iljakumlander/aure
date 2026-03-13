/**
 * Responder — RAG retrieval → context building → LLM streaming.
 */

import type { Retriever, RetrievalResult } from '../../../../α/src/types/index.js';
import type { ChatDB } from '../db/index.js';
import type { LLMAdapter, LLMMessage } from '../llm/types.js';
import type { SSEManager } from '../server/sse.js';
import type { Persona, SourceRef, Message } from '../types/index.js';

export interface ResponderDeps {
  chatDB: ChatDB;
  retriever: Retriever;
  llm: LLMAdapter;
  sse: SSEManager;
  persona: Persona;
}

export interface Responder {
  respond(conversationId: string, signal?: AbortSignal): Promise<void>;
}

function buildContextBlock(results: RetrievalResult[]): string {
  if (results.length === 0) return '';

  const parts = results.map((r, i) => {
    const source = r.chunk.fileName;
    const section = r.chunk.sectionHeading ? ` > ${r.chunk.sectionHeading}` : '';
    const page = r.chunk.pageNumber ? ` (p.${r.chunk.pageNumber})` : '';
    return `[Source ${i + 1}: ${source}${section}${page}]\n${r.chunk.text}`;
  });

  return `Here are relevant excerpts from your documents:\n\n${parts.join('\n\n')}\n\nUse these excerpts to answer the question.`;
}

function resultsToSources(results: RetrievalResult[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();

  for (const r of results) {
    const key = r.chunk.fileName;
    const existing = seen.get(key);
    if (!existing || r.score > existing.score) {
      seen.set(key, {
        fileName: r.chunk.fileName,
        filePath: r.chunk.fileName,
        pageNumber: r.chunk.pageNumber,
        sectionHeading: r.chunk.sectionHeading,
        score: r.score,
        highlightedText: r.highlights?.[0]?.text ?? r.chunk.text.slice(0, 100),
      });
    }
  }

  return [...seen.values()];
}

export function createResponder(deps: ResponderDeps): Responder {
  const { chatDB, retriever, llm, sse, persona } = deps;

  return {
    async respond(conversationId, signal?) {
      // Gather unresponded visitor messages
      const unresponded = chatDB.getUnrespondedVisitorMessages(conversationId);
      if (unresponded.length === 0) return;

      // Combine into a single query
      const query = unresponded.map(m => m.content).join('\n');

      // Create the assistant message placeholder
      const assistantMsg = chatDB.addMessage(conversationId, 'assistant', '', 'streaming');

      sse.send(conversationId, {
        event: 'message:start',
        data: { messageId: assistantMsg.id },
      });

      try {
        // Retrieve relevant chunks
        const results = await retriever.retrieve(query);
        const sources = resultsToSources(results);
        const contextBlock = buildContextBlock(results);

        // Build message history for LLM
        // Combine persona + instructions + context into ONE system message
        // (small models like gemma3:1b handle single system messages much better)
        const allMessages = chatDB.getMessages(conversationId);
        const llmMessages: LLMMessage[] = [];

        const systemParts = [persona.systemPrompt];
        if (persona.instructions) systemParts.push(persona.instructions);
        if (contextBlock) systemParts.push(contextBlock);
        llmMessages.push({ role: 'system', content: systemParts.join('\n\n') });

        // History (exclude the placeholder we just created)
        for (const msg of allMessages) {
          if (msg.id === assistantMsg.id) continue;
          if (msg.role === 'system') continue;
          llmMessages.push({
            role: msg.role === 'visitor' ? 'user' : 'assistant',
            content: msg.content,
          });
        }

        // Stream LLM response
        let finalContent = '';

        for await (const event of llm.chat(llmMessages, signal)) {
          if (signal?.aborted) {
            chatDB.updateMessageStatus(assistantMsg.id, 'cancelled');
            chatDB.updateMessageContent(assistantMsg.id, finalContent);
            sse.send(conversationId, {
              event: 'message:cancelled',
              data: { messageId: assistantMsg.id },
            });
            return;
          }

          switch (event.type) {
            case 'token':
              finalContent += event.content;
              sse.send(conversationId, {
                event: 'message:token',
                data: { messageId: assistantMsg.id, token: event.content },
              });
              break;

            case 'done':
              finalContent = event.totalContent;
              chatDB.updateMessageContent(assistantMsg.id, finalContent);
              chatDB.updateMessageStatus(assistantMsg.id, 'done');
              chatDB.updateMessageSources(assistantMsg.id, sources);
              sse.send(conversationId, {
                event: 'message:done',
                data: { messageId: assistantMsg.id, content: finalContent, sources },
              });
              break;

            case 'error':
              chatDB.updateMessageContent(assistantMsg.id, finalContent);
              chatDB.updateMessageStatus(assistantMsg.id, 'error');
              sse.send(conversationId, {
                event: 'message:error',
                data: { messageId: assistantMsg.id, error: event.error },
              });
              break;
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          chatDB.updateMessageStatus(assistantMsg.id, 'cancelled');
          sse.send(conversationId, {
            event: 'message:cancelled',
            data: { messageId: assistantMsg.id },
          });
          return;
        }

        const error = err instanceof Error ? err.message : String(err);
        chatDB.updateMessageStatus(assistantMsg.id, 'error');
        chatDB.updateMessageContent(assistantMsg.id, '');
        sse.send(conversationId, {
          event: 'message:error',
          data: { messageId: assistantMsg.id, error },
        });
      }
    },
  };
}
