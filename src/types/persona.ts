/**
 * Persona configuration — defines how aure behaves.
 *
 * This lives in the private data repo (data/persona.yaml)
 * and shapes the auto-responder's tone, boundaries, and knowledge.
 */

export interface Persona {
  /** Display name of the persona (shown in chat) */
  name: string;

  /** Short description — "who is this?" */
  description: string;

  /**
   * Master prompt — the system instruction for the LLM.
   * This is the soul of the auto-responder.
   * Example: "You are an answering machine for Ilja's personal site..."
   */
  systemPrompt: string;

  /**
   * Greeting — what aure says when a visitor opens the chat.
   * Can reference {name} placeholder.
   */
  greeting: string;

  /**
   * Fallback — what to say when aure has no relevant data.
   * Honest > hallucinated.
   */
  fallback: string;

  /**
   * Languages the persona operates in.
   * LLM will try to respond in the visitor's language
   * if it's in this list.
   */
  languages: string[];

  /**
   * Topics the persona refuses to discuss.
   * The LLM will politely decline.
   */
  blockedTopics: string[];
}
