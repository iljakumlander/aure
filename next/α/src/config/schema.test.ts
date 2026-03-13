import { describe, it, expect } from 'vitest';
import { validateConfig, ConfigValidationError } from './schema.js';

describe('validateConfig', () => {
  it('accepts minimal config', () => {
    const result = validateConfig({ preset: 'pi5' });
    expect(result.preset).toBe('pi5');
  });

  it('accepts empty/null config', () => {
    expect(validateConfig(null)).toEqual({});
    expect(validateConfig(undefined)).toEqual({});
  });

  it('rejects non-object config', () => {
    expect(() => validateConfig('string')).toThrow(ConfigValidationError);
    expect(() => validateConfig([1, 2])).toThrow(ConfigValidationError);
  });

  it('rejects invalid preset name', () => {
    expect(() => validateConfig({ preset: 'banana' })).toThrow('preset must be one of');
  });

  it('rejects negative dimensions', () => {
    expect(() => validateConfig({ embedding: { dimensions: -1 } })).toThrow('positive integer');
  });

  it('rejects non-integer dimensions', () => {
    expect(() => validateConfig({ embedding: { dimensions: 3.5 } })).toThrow('positive integer');
  });

  it('rejects negative batchSize', () => {
    expect(() => validateConfig({ embedding: { batchSize: 0 } })).toThrow('positive integer');
  });

  it('rejects invalid adapter', () => {
    expect(() => validateConfig({ vectordb: { adapter: 'redis' } })).toThrow('vectordb.adapter must be one of');
  });

  it('rejects overlap >= maxTokens', () => {
    expect(() => validateConfig({ chunking: { maxTokens: 100, overlap: 100 } })).toThrow('overlap must be less than');
    expect(() => validateConfig({ chunking: { maxTokens: 100, overlap: 200 } })).toThrow('overlap must be less than');
  });

  it('rejects negative overlap', () => {
    expect(() => validateConfig({ chunking: { overlap: -1 } })).toThrow('non-negative integer');
  });

  it('rejects invalid strategy', () => {
    expect(() => validateConfig({ chunking: { strategy: 'random' } })).toThrow('chunking.strategy must be one of');
  });

  it('rejects scoreThreshold out of range', () => {
    expect(() => validateConfig({ retrieval: { scoreThreshold: -0.1 } })).toThrow('between 0 and 1');
    expect(() => validateConfig({ retrieval: { scoreThreshold: 1.5 } })).toThrow('between 0 and 1');
  });

  it('rejects non-array supportedTypes', () => {
    expect(() => validateConfig({ reference: { supportedTypes: '.pdf' } })).toThrow('must be an array');
  });

  it('rejects supportedTypes without dot prefix', () => {
    expect(() => validateConfig({ reference: { supportedTypes: ['pdf'] } })).toThrow('starting with "."');
  });

  it('accepts valid complete config', () => {
    const result = validateConfig({
      preset: 'm-series',
      embedding: { model: 'custom-model', dimensions: 512, batchSize: 16 },
      vectordb: { adapter: 'qdrant' },
      chunking: { strategy: 'fixed', maxTokens: 300, overlap: 50 },
      retrieval: { topK: 7, scoreThreshold: 0.5 },
      reference: { supportedTypes: ['.pdf', '.md'] },
    });
    expect(result.preset).toBe('m-series');
  });

  it('ignores unknown top-level keys', () => {
    const result = validateConfig({ preset: 'pi5', futureKey: 'hello' });
    expect(result.preset).toBe('pi5');
  });
});
