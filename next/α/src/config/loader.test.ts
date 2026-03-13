import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, mergeConfig, configExists } from './loader.js';
import { PI5_PRESET, M_SERIES_PRESET } from './presets.js';

const TEST_DIR = join(tmpdir(), 'aure-alpha-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeYaml(filename: string, content: string): string {
  const path = join(TEST_DIR, filename);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('loadConfig', () => {
  it('loads minimal config and returns full pi5 defaults', () => {
    const path = writeYaml('config.yaml', 'preset: pi5\n');
    const config = loadConfig(path);
    expect(config.preset).toBe('pi5');
    expect(config.embedding.model).toBe('all-minilm');
    expect(config.embedding.dimensions).toBe(384);
    expect(config.vectordb.adapter).toBe('sqlite-vec');
    expect(config.chunking.maxTokens).toBe(256);
    expect(config.retrieval.topK).toBe(3);
  });

  it('overrides individual fields while keeping preset defaults', () => {
    const path = writeYaml('config.yaml', [
      'preset: pi5',
      'embedding:',
      '  model: custom-embed',
      '',
    ].join('\n'));
    const config = loadConfig(path);
    expect(config.embedding.model).toBe('custom-embed');
    expect(config.embedding.dimensions).toBe(384); // kept from pi5
    expect(config.embedding.batchSize).toBe(8);    // kept from pi5
  });

  it('loads m-series preset', () => {
    const path = writeYaml('config.yaml', 'preset: m-series\n');
    const config = loadConfig(path);
    expect(config.embedding.model).toBe('nomic-embed-text');
    expect(config.embedding.dimensions).toBe(768);
    expect(config.retrieval.topK).toBe(5);
  });

  it('defaults to pi5 when no preset specified', () => {
    const path = writeYaml('config.yaml', 'server:\n  port: 4000\n');
    const config = loadConfig(path);
    expect(config.preset).toBe('pi5');
    expect(config.server.port).toBe(4000);
    expect(config.embedding.model).toBe('all-minilm');
  });

  it('handles empty config file', () => {
    const path = writeYaml('config.yaml', '');
    const config = loadConfig(path);
    expect(config.preset).toBe('pi5');
    expect(config.embedding.model).toBe('all-minilm');
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow('Config file not found');
  });

  it('throws on invalid config values', () => {
    const path = writeYaml('config.yaml', 'embedding:\n  dimensions: -5\n');
    expect(() => loadConfig(path)).toThrow('positive integer');
  });
});

describe('mergeConfig', () => {
  it('overrides only specified sections', () => {
    const result = mergeConfig(PI5_PRESET, {
      chunking: { maxTokens: 128 },
    });
    expect(result.chunking.maxTokens).toBe(128);
    expect(result.chunking.overlap).toBe(32);    // kept from pi5
    expect(result.embedding.model).toBe('all-minilm'); // untouched
  });

  it('overrides preset name', () => {
    const result = mergeConfig(PI5_PRESET, { preset: 'm-series' });
    expect(result.preset).toBe('m-series');
  });

  it('does not mutate the base preset', () => {
    mergeConfig(PI5_PRESET, { embedding: { model: 'test' } });
    expect(PI5_PRESET.embedding.model).toBe('all-minilm');
  });
});

describe('configExists', () => {
  it('returns true for existing file', () => {
    const path = writeYaml('config.yaml', 'preset: pi5\n');
    expect(configExists(path)).toBe(true);
  });

  it('returns false for missing file', () => {
    expect(configExists(join(TEST_DIR, 'nope.yaml'))).toBe(false);
  });
});
