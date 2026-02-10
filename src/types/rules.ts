/**
 * Rules engine — keyword-based overrides that fire BEFORE the LLM.
 *
 * This is for the author's peace of mind: predictable responses
 * to specific triggers, without burning LLM tokens.
 *
 * Rules are checked against the visitor's message.
 * If a rule matches, its response is used directly (no LLM call).
 * If no rule matches, the message goes to the LLM.
 */

export interface Rule {
  /** Unique identifier */
  id: string;

  /** Human-readable label for the admin panel */
  label: string;

  /**
   * Match condition.
   * - 'keywords': any of the keywords appear in the message
   * - 'pattern':  regex match against the message
   * - 'exact':    exact string match (case-insensitive)
   */
  match: KeywordMatch | PatternMatch | ExactMatch;

  /** What to respond with */
  response: string;

  /** Priority — higher wins when multiple rules match */
  priority: number;

  /** Is this rule active? */
  enabled: boolean;
}

export interface KeywordMatch {
  type: 'keywords';
  /** Any of these keywords triggers the rule */
  keywords: string[];
  /** Require ALL keywords instead of ANY? */
  all?: boolean;
}

export interface PatternMatch {
  type: 'pattern';
  /** Regex pattern string */
  pattern: string;
  /** Regex flags (e.g. 'i' for case-insensitive) */
  flags?: string;
}

export interface ExactMatch {
  type: 'exact';
  /** Exact string to match (case-insensitive) */
  value: string;
}

/**
 * Spam filter rules — simpler structure.
 * If a message matches any spam rule, it's flagged.
 */
export interface SpamRule {
  id: string;
  label: string;
  match: KeywordMatch | PatternMatch;
  /** 'flag' marks as spam but keeps; 'drop' silently ignores */
  action: 'flag' | 'drop';
}
