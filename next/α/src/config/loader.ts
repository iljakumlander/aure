/**
 * Config loader for Aure α.
 * Reads YAML, validates, and merges with preset defaults.
 */

import { readFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';
import type { AlphaConfig, ResolvedAlphaConfig } from '../types/config.js';
import { getPreset } from './presets.js';
import { validateConfig } from './schema.js';

/**
 * Merge preset defaults with user overrides.
 * Shallow-per-section: each config section is individually spread-merged.
 */
export function mergeConfig(base: ResolvedAlphaConfig, overrides: AlphaConfig): ResolvedAlphaConfig {
  return {
    preset: overrides.preset ?? base.preset,
    embedding: { ...base.embedding, ...overrides.embedding },
    vectordb: { ...base.vectordb, ...overrides.vectordb },
    chunking: { ...base.chunking, ...overrides.chunking },
    retrieval: { ...base.retrieval, ...overrides.retrieval },
    reference: { ...base.reference, ...overrides.reference },
    server: { ...base.server, ...overrides.server },
    llm: { ...base.llm, ...overrides.llm },
  };
}

/**
 * Load and resolve a config file.
 * Reads YAML, validates, determines preset, and merges.
 */
export function loadConfig(configPath: string): ResolvedAlphaConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed = YAML.parse(raw);
  const config = validateConfig(parsed);
  const presetName = config.preset ?? 'pi5';
  const base = getPreset(presetName);

  return mergeConfig(base, config);
}

/**
 * Check if a config file exists at the given path.
 */
export function configExists(configPath: string): boolean {
  return existsSync(configPath);
}
