/**
 * Data loader — reads the private data directory
 * and makes it available as context for the LLM.
 *
 * Watches for changes so you can edit notes/CV
 * without restarting aure.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parse as parseYaml } from './yaml.js';
import type { AureConfig, Persona, Rule, SpamRule, DataChunk, DataSource } from '../types/index.js';

export interface LoadedData {
  config: AureConfig;
  persona: Persona;
  rules: Rule[];
  spamRules: SpamRule[];
  chunks: DataChunk[];
}

/**
 * Load all data from the data directory.
 */
export function loadData(dataDir: string): LoadedData {
  const configPath = join(dataDir, 'config.yaml');
  const personaPath = join(dataDir, 'persona.yaml');
  const rulesPath = join(dataDir, 'rules.yaml');

  if (!existsSync(configPath)) {
    throw new Error(
      `Config not found at ${configPath}. ` +
      `Copy data.example/ to data/ and customize it.`
    );
  }

  const config = parseYaml(readFileSync(configPath, 'utf-8')) as AureConfig;
  const persona = existsSync(personaPath)
    ? parseYaml(readFileSync(personaPath, 'utf-8')) as Persona
    : defaultPersona();

  const rulesData = existsSync(rulesPath)
    ? parseYaml(readFileSync(rulesPath, 'utf-8')) as any
    : { rules: [], spam: [] };

  const chunks = loadSources(dataDir, config.sources ?? []);

  return {
    config,
    persona,
    rules: rulesData.rules ?? [],
    spamRules: rulesData.spam ?? [],
    chunks,
  };
}

/**
 * Load all data sources into chunks.
 */
function loadSources(dataDir: string, sources: DataSource[]): DataChunk[] {
  const chunks: DataChunk[] = [];

  for (const source of sources) {
    const sourcePath = join(dataDir, source.path);
    if (!existsSync(sourcePath)) continue;

    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      const files = readdirSync(sourcePath).filter(f => !f.startsWith('.'));
      for (const file of files) {
        const filePath = join(sourcePath, file);
        const content = readFileSync(filePath, 'utf-8').trim();
        if (!content) continue;

        chunks.push({
          source: source.name,
          content,
          metadata: {
            file,
            format: source.format,
            description: source.description,
          },
        });
      }
    } else {
      const content = readFileSync(sourcePath, 'utf-8').trim();
      if (content) {
        chunks.push({
          source: source.name,
          content,
          metadata: {
            file: source.path,
            format: source.format,
            description: source.description,
          },
        });
      }
    }
  }

  return chunks;
}

function defaultPersona(): Persona {
  return {
    name: 'aure',
    description: 'An answering machine',
    systemPrompt: 'You are a helpful answering machine on a personal website.',
    greeting: 'Hey! Leave a message and I\'ll make sure it gets through.',
    fallback: 'I don\'t have information about that. Want me to pass your question along?',
    languages: ['en'],
    blockedTopics: [],
  };
}
