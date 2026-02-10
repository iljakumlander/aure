/**
 * LLM provider abstraction.
 *
 * A provider takes a system prompt + conversation history
 * and returns a response string. That's it.
 *
 * No streaming for now — aure is an answering machine,
 * not a real-time chat. The visitor sends a message,
 * aure thinks, aure responds.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  /** How many tokens were used (if provider reports it) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LLMAdapter {
  /** Human-readable name for logs */
  name: string;

  /**
   * Generate a response from a conversation.
   * The first message should be the system prompt.
   */
  chat(messages: LLMMessage[]): Promise<LLMResponse>;

  /** Check if the provider is reachable */
  health(): Promise<boolean>;
}
