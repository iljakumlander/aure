/**
 * Core message types for aure conversations.
 *
 * A conversation is a thread between a visitor and the auto-responder.
 * Messages flow in two directions:
 *   - inbound:  visitor → aure (questions, comments, contact attempts)
 *   - outbound: aure → visitor (auto-responses based on data + LLM)
 *
 * The author reviews conversations through the admin panel,
 * where the LLM summarises what happened since the last visit.
 */

/** Every message gets a status lifecycle */
export type MessageStatus = 'received' | 'read' | 'archived' | 'spam';

/** Who sent this message */
export type MessageRole = 'visitor' | 'aure';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;   // ISO 8601
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  /** Visitor-chosen display name, if any */
  visitorName: string | null;
  /** Visitor email — optional, for follow-up */
  visitorEmail: string | null;
  /** LLM-generated summary of the conversation (updated periodically) */
  summary: string | null;
  /** LLM-assigned relevance tags */
  tags: string[];
  /** Is this conversation flagged as spam? */
  spam: boolean;
  /** Has the author seen this conversation? */
  seen: boolean;
  /** Pinned conversations stay at the top */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin digest — what the LLM prepares for the author
 * when they open the admin panel.
 */
export interface AdminDigest {
  /** Since when is this digest calculated */
  since: string;
  /** Total new messages since last visit */
  newMessageCount: number;
  /** Conversations sorted by relevance */
  conversations: ConversationPreview[];
  /** One-paragraph summary of everything that happened */
  overallSummary: string;
}

export interface ConversationPreview {
  conversation: Conversation;
  /** Last few messages for context */
  recentMessages: Message[];
  /** LLM-generated topic of this conversation */
  topic: string;
  /** Relevance score (0-1) assigned by LLM */
  relevance: number;
}
