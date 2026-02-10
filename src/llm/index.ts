/**
 * LLM provider factory.
 *
 * Creates the right adapter based on config.
 * Add new providers here.
 */

import type { LLMProvider } from '../types/index.js';
import type { LLMAdapter } from './provider.js';
import { createOllamaAdapter } from './ollama.js';

export type { LLMAdapter, LLMMessage, LLMResponse } from './provider.js';

export function createLLMAdapter(config: LLMProvider): LLMAdapter {
  switch (config.type) {
    case 'ollama':
      return createOllamaAdapter(config);

    case 'openai':
      // Future: import { createOpenAIAdapter } from './openai.js';
      throw new Error(
        'OpenAI provider not yet implemented. ' +
        'Contributions welcome — it\'s just a fetch() call to a different URL.'
      );

    case 'anthropic':
      // Future: import { createAnthropicAdapter } from './anthropic.js';
      throw new Error(
        'Anthropic provider not yet implemented. ' +
        'Contributions welcome — it\'s just a fetch() call to a different URL.'
      );

    default:
      throw new Error(`Unknown LLM provider type: ${(config as any).type}`);
  }
}
