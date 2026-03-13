/**
 * Config validation for Aure α.
 * Hand-written checks — no external schema library.
 */

import type { AlphaConfig } from '../types/config.js';

const VALID_PRESETS = new Set(['pi5', 'm-series', 'gpu', 'custom']);
const VALID_ADAPTERS = new Set(['sqlite-vec', 'lancedb', 'qdrant']);
const VALID_STRATEGIES = new Set(['semantic', 'fixed']);

export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Invalid config:\n  ${errors.join('\n  ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function validateConfig(raw: unknown): AlphaConfig {
  if (raw === null || raw === undefined) {
    return {};
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigValidationError(['Config must be an object']);
  }

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.preset !== undefined) {
    if (typeof obj.preset !== 'string' || !VALID_PRESETS.has(obj.preset)) {
      errors.push(`preset must be one of: ${[...VALID_PRESETS].join(', ')}`);
    }
  }

  if (obj.embedding !== undefined) {
    if (typeof obj.embedding !== 'object' || obj.embedding === null) {
      errors.push('embedding must be an object');
    } else {
      const e = obj.embedding as Record<string, unknown>;
      if (e.dimensions !== undefined && (typeof e.dimensions !== 'number' || e.dimensions <= 0 || !Number.isInteger(e.dimensions))) {
        errors.push('embedding.dimensions must be a positive integer');
      }
      if (e.batchSize !== undefined && (typeof e.batchSize !== 'number' || e.batchSize <= 0 || !Number.isInteger(e.batchSize))) {
        errors.push('embedding.batchSize must be a positive integer');
      }
    }
  }

  if (obj.vectordb !== undefined) {
    if (typeof obj.vectordb !== 'object' || obj.vectordb === null) {
      errors.push('vectordb must be an object');
    } else {
      const v = obj.vectordb as Record<string, unknown>;
      if (v.adapter !== undefined && (typeof v.adapter !== 'string' || !VALID_ADAPTERS.has(v.adapter))) {
        errors.push(`vectordb.adapter must be one of: ${[...VALID_ADAPTERS].join(', ')}`);
      }
    }
  }

  if (obj.chunking !== undefined) {
    if (typeof obj.chunking !== 'object' || obj.chunking === null) {
      errors.push('chunking must be an object');
    } else {
      const c = obj.chunking as Record<string, unknown>;
      if (c.maxTokens !== undefined && (typeof c.maxTokens !== 'number' || c.maxTokens <= 0 || !Number.isInteger(c.maxTokens))) {
        errors.push('chunking.maxTokens must be a positive integer');
      }
      if (c.overlap !== undefined && (typeof c.overlap !== 'number' || c.overlap < 0 || !Number.isInteger(c.overlap))) {
        errors.push('chunking.overlap must be a non-negative integer');
      }
      if (c.strategy !== undefined && (typeof c.strategy !== 'string' || !VALID_STRATEGIES.has(c.strategy))) {
        errors.push(`chunking.strategy must be one of: ${[...VALID_STRATEGIES].join(', ')}`);
      }
      if (typeof c.maxTokens === 'number' && typeof c.overlap === 'number' && c.overlap >= c.maxTokens) {
        errors.push('chunking.overlap must be less than chunking.maxTokens');
      }
    }
  }

  if (obj.retrieval !== undefined) {
    if (typeof obj.retrieval !== 'object' || obj.retrieval === null) {
      errors.push('retrieval must be an object');
    } else {
      const r = obj.retrieval as Record<string, unknown>;
      if (r.topK !== undefined && (typeof r.topK !== 'number' || r.topK <= 0 || !Number.isInteger(r.topK))) {
        errors.push('retrieval.topK must be a positive integer');
      }
      if (r.scoreThreshold !== undefined && (typeof r.scoreThreshold !== 'number' || r.scoreThreshold < 0 || r.scoreThreshold > 1)) {
        errors.push('retrieval.scoreThreshold must be a number between 0 and 1');
      }
    }
  }

  if (obj.reference !== undefined) {
    if (typeof obj.reference !== 'object' || obj.reference === null) {
      errors.push('reference must be an object');
    } else {
      const ref = obj.reference as Record<string, unknown>;
      if (ref.supportedTypes !== undefined) {
        if (!Array.isArray(ref.supportedTypes)) {
          errors.push('reference.supportedTypes must be an array');
        } else if (!ref.supportedTypes.every((t: unknown) => typeof t === 'string' && t.startsWith('.'))) {
          errors.push('reference.supportedTypes entries must be strings starting with "."');
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return obj as AlphaConfig;
}
