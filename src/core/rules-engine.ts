/**
 * Rules engine — checks visitor messages against keyword rules
 * BEFORE calling the LLM. Saves tokens, gives predictable responses.
 */

import type { Rule, SpamRule } from '../types/index.js';

export interface RuleMatch {
  rule: Rule;
  response: string;
}

export interface SpamMatch {
  rule: SpamRule;
  action: 'flag' | 'drop';
}

/**
 * Check a message against rules. Returns the highest-priority match, or null.
 */
export function matchRule(message: string, rules: Rule[]): RuleMatch | null {
  const normalised = message.toLowerCase();

  const matches = rules
    .filter(r => r.enabled)
    .filter(r => testMatch(normalised, r.match))
    .sort((a, b) => b.priority - a.priority);

  if (matches.length === 0) return null;

  return {
    rule: matches[0],
    response: matches[0].response,
  };
}

/**
 * Check a message against spam rules. Returns first match, or null.
 */
export function matchSpam(message: string, spamRules: SpamRule[]): SpamMatch | null {
  const normalised = message.toLowerCase();

  for (const rule of spamRules) {
    if (testMatch(normalised, rule.match)) {
      return { rule, action: rule.action };
    }
  }

  return null;
}

function testMatch(
  normalised: string,
  match: Rule['match'] | SpamRule['match']
): boolean {
  switch (match.type) {
    case 'keywords': {
      const test = match.all
        ? match.keywords.every(kw => normalised.includes(kw.toLowerCase()))
        : match.keywords.some(kw => normalised.includes(kw.toLowerCase()));
      return test;
    }

    case 'pattern': {
      const regex = new RegExp(match.pattern, match.flags ?? 'i');
      return regex.test(normalised);
    }

    case 'exact':
      return normalised === match.value.toLowerCase();

    default:
      return false;
  }
}
