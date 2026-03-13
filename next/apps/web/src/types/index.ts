/**
 * Chat types for Aure web.
 */

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'visitor' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled';

export interface SourceRef {
  fileName: string;
  filePath: string;
  pageNumber?: number;
  sectionHeading?: string;
  score: number;
  highlightedText: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  sources: SourceRef[];
  createdAt: string;
}

export interface Persona {
  name: string;
  systemPrompt: string;
  instructions: string;
  greeting: string;
}
