/**
 * The responder — the brain of aure.
 *
 * Takes a visitor's message, checks rules, builds context,
 * calls the LLM, and returns a response.
 *
 * Flow:
 *   1. Check spam rules → if match, flag/drop
 *   2. Check keyword rules → if match, return canned response
 *   3. Build context from data chunks (notes, CV, etc.)
 *   4. Build conversation history
 *   5. Call LLM
 *   6. Return response
 */

import type { Persona, Rule, SpamRule, DataChunk } from '../types/index.js';
import type { LLMAdapter, LLMMessage } from '../llm/provider.js';
import { matchRule, matchSpam } from './rules-engine.js';

export interface ResponderConfig {
  persona: Persona;
  rules: Rule[];
  spamRules: SpamRule[];
  chunks: DataChunk[];
  llm: LLMAdapter;
}

export interface RespondResult {
  /** The response text */
  content: string;
  /** How was this response generated? */
  source: 'rule' | 'llm' | 'fallback' | 'greeting';
  /** Was the message flagged as spam? */
  spam: boolean;
  /** Should the message be silently dropped? */
  drop: boolean;
}

export function createResponder(config: ResponderConfig) {
  const { persona, rules, spamRules, chunks, llm } = config;

  return {
    /** Get the greeting message for a new conversation */
    greeting(): string {
      return persona.greeting;
    },

    /** Access persona config (for fallback text, etc.) */
    get persona() {
      return persona;
    },

    /** Fast spam check — no LLM call */
    checkSpam(message: string) {
      return matchSpam(message, spamRules);
    },

    /** Fast keyword rules check — no LLM call */
    checkRules(message: string) {
      return matchRule(message, rules);
    },

    /** Process a visitor's message and generate a response.
     *  Pass signal to allow cancellation (e.g. visitor pressed cancel). */
    async respond(
      message: string,
      history: LLMMessage[] = [],
      signal?: AbortSignal
    ): Promise<RespondResult> {
      // 1. Spam check
      const spam = matchSpam(message, spamRules);
      if (spam) {
        if (spam.action === 'drop') {
          return { content: '', source: 'rule', spam: true, drop: true };
        }
        // Flagged but not dropped — still respond, but mark
        return {
          content: persona.fallback,
          source: 'rule',
          spam: true,
          drop: false,
        };
      }

      // 2. Keyword rules
      const rule = matchRule(message, rules);
      if (rule) {
        return {
          content: rule.response,
          source: 'rule',
          spam: false,
          drop: false,
        };
      }

      // 3. Build context for LLM
      const context = buildContext(message, chunks);
      const systemPrompt = buildSystemPrompt(persona, context);

      // 4. Build messages array
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      // 5. Call LLM — let errors propagate to the caller.
      // Background jobs (jobs.ts) handle errors with proper DB + SSE notification.
      const response = await llm.chat(messages, signal);
      return {
        content: response.content,
        source: 'llm',
        spam: false,
        drop: false,
      };
    },
  };
}

/**
 * Build the system prompt with persona + relevant data context.
 */
function buildSystemPrompt(persona: Persona, context: string): string {
  let prompt = persona.systemPrompt;

  if (persona.blockedTopics.length > 0) {
    prompt += `\n\nDo NOT discuss the following topics: ${persona.blockedTopics.join(', ')}.`;
    prompt += ' Politely decline if asked.';
  }

  if (persona.languages.length > 0) {
    prompt += `\n\nYou can communicate in: ${persona.languages.join(', ')}.`;
    prompt += ' Try to match the visitor\'s language.';
  }

  if (context) {
    prompt += '\n\n--- Available information ---\n' + context;
    prompt += '\n--- End of available information ---';
    prompt += '\n\nUse ONLY the information above to answer questions.';
    prompt += ' If the information doesn\'t cover the question, say so honestly.';
  }

  return prompt;
}

/**
 * Find relevant data chunks for the visitor's message.
 *
 * For MVP: include ALL chunks (they're small — notes + CV).
 * Future: use embeddings / RAG for large datasets.
 */
function buildContext(message: string, chunks: DataChunk[]): string {
  if (chunks.length === 0) return '';

  // For now, include everything. On Raspberry Pi with small data,
  // this is fine. The model context window is the limit.
  return chunks
    .map(chunk => {
      const label = chunk.metadata?.description ?? chunk.source;
      return `[${label}]\n${chunk.content}`;
    })
    .join('\n\n');
}
