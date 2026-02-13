/**
 * A pre-loaded Q&A pair ("memory") injected into the conversation
 * before the real dialogue. The LLM treats these as its own past
 * responses and stays consistent with the facts.
 */
export interface MemoryPair {
  user: string;
  assistant: string;
}
