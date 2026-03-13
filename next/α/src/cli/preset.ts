/**
 * `aure preset` command.
 * Switch between hardware presets and manage Ollama models.
 */

import { defineCommand } from 'citty';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import YAML from 'yaml';
import { getPreset, PRESETS } from '../config/presets.js';
import { configExists, loadConfig } from '../config/loader.js';

const PRESET_LABELS: Record<string, string> = {
  pi5: 'Pi 5 (all-minilm 384d, gemma3:1b)',
  'm-series': 'M-Series Mac (nomic-embed-text 768d, gemma3:4b)',
  gpu: 'GPU / Cloud (mxbai-embed-large 1024d, llama3:8b)',
};

function ollamaModelExists(model: string, baseUrl: string): boolean {
  try {
    const res = execSync(
      `curl -sf "${baseUrl}/api/tags"`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    const data = JSON.parse(res);
    return data.models?.some((m: { name: string }) =>
      m.name === model || m.name.startsWith(`${model}:`),
    ) ?? false;
  } catch {
    return false;
  }
}

function ollamaPull(model: string): boolean {
  try {
    console.log(`  Pulling ${model}...`);
    execSync(`ollama pull ${model}`, { stdio: 'inherit', timeout: 600_000 });
    return true;
  } catch {
    console.error(`  Failed to pull ${model}`);
    return false;
  }
}

/** List available presets and show which is active. */
const listCommand = defineCommand({
  meta: { name: 'list', description: 'List available presets' },
  args: {
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
  },
  run({ args }) {
    const configPath = resolve(args.config);
    let activePreset: string | undefined;
    if (configExists(configPath)) {
      activePreset = loadConfig(configPath).preset;
    }

    console.log('');
    console.log('  Aure α — Presets');
    console.log('');
    for (const [name, label] of Object.entries(PRESET_LABELS)) {
      const marker = name === activePreset ? ' ←' : '';
      console.log(`  ${name.padEnd(10)} ${label}${marker}`);
    }
    console.log('');
  },
});

/** Switch to a different preset, rewrite config, optionally pull models. */
const switchCommand = defineCommand({
  meta: { name: 'switch', description: 'Switch to a different preset' },
  args: {
    name: {
      type: 'positional',
      description: 'Preset name: pi5, m-series, gpu',
      required: true,
    },
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
    pull: {
      type: 'boolean',
      description: 'Pull required Ollama models',
      default: true,
    },
    'skip-pull': {
      type: 'boolean',
      description: 'Skip pulling Ollama models',
      default: false,
    },
  },
  async run({ args }) {
    const presetName = args.name as string;
    const configPath = resolve(args.config);
    const shouldPull = args.pull && !args['skip-pull'];

    let preset;
    try {
      preset = getPreset(presetName);
    } catch {
      console.error(`Unknown preset "${presetName}". Available: ${Object.keys(PRESET_LABELS).join(', ')}`);
      process.exit(1);
    }

    console.log('');
    console.log('  Aure α — Preset Switch');
    console.log('');
    console.log(`  Switching to: ${PRESET_LABELS[presetName] ?? presetName}`);
    console.log('');

    // Write config
    const { preset: _name, ...sections } = preset;
    const configContent = YAML.stringify({ preset: presetName, ...sections });
    const header = '# Aure α configuration\n# See PROSPECT.md for full documentation\n\n';
    writeFileSync(configPath, header + configContent, 'utf-8');
    console.log('  ✓ Updated config.yaml');

    // Pull models
    if (shouldPull) {
      const baseUrl = preset.embedding.baseUrl;
      const models = [preset.embedding.model, preset.llm.model];

      for (const model of models) {
        if (ollamaModelExists(model, baseUrl)) {
          console.log(`  ✓ ${model} already available`);
        } else {
          ollamaPull(model);
        }
      }
    } else {
      console.log(`  Skipped model pull. Run manually:`);
      console.log(`    ollama pull ${preset.embedding.model}`);
      console.log(`    ollama pull ${preset.llm.model}`);
    }

    // Warn about re-indexing
    const dbPath = resolve(join(resolve('.'), preset.vectordb.path ?? './aure-vectors.db'));
    if (existsSync(dbPath)) {
      console.log('');
      console.log('  ⚠ Existing index uses a different embedding model.');
      console.log('  Run `aure ingest --force` to re-embed with the new model.');
    }

    console.log('');
  },
});

/** Pull models for a preset (or current config). */
const pullCommand = defineCommand({
  meta: { name: 'pull', description: 'Pull Ollama models for a preset' },
  args: {
    name: {
      type: 'positional',
      description: 'Preset name (default: current config)',
    },
    config: {
      type: 'string',
      description: 'Path to config.yaml',
      default: './config.yaml',
    },
    'embedding-only': {
      type: 'boolean',
      description: 'Only pull the embedding model',
      default: false,
    },
    'llm-only': {
      type: 'boolean',
      description: 'Only pull the LLM model',
      default: false,
    },
  },
  async run({ args }) {
    let embeddingModel: string;
    let llmModel: string;
    let baseUrl: string;
    let label: string;

    if (args.name) {
      const preset = getPreset(args.name as string);
      embeddingModel = preset.embedding.model;
      llmModel = preset.llm.model;
      baseUrl = preset.embedding.baseUrl;
      label = args.name as string;
    } else {
      const configPath = resolve(args.config);
      if (!configExists(configPath)) {
        console.error('No config found. Specify a preset name or run `aure init` first.');
        process.exit(1);
      }
      const config = loadConfig(configPath);
      embeddingModel = config.embedding.model;
      llmModel = config.llm.model;
      baseUrl = config.embedding.baseUrl;
      label = config.preset;
    }

    console.log('');
    console.log(`  Aure α — Pull Models (${label})`);
    console.log('');

    const models: string[] = [];
    if (args['embedding-only']) {
      models.push(embeddingModel);
    } else if (args['llm-only']) {
      models.push(llmModel);
    } else {
      models.push(embeddingModel, llmModel);
    }

    for (const model of models) {
      if (ollamaModelExists(model, baseUrl)) {
        console.log(`  ✓ ${model} already available`);
      } else {
        ollamaPull(model);
      }
    }

    console.log('');
  },
});

export const presetCommand = defineCommand({
  meta: {
    name: 'preset',
    description: 'Manage hardware presets and Ollama models',
  },
  subCommands: {
    list: listCommand,
    switch: switchCommand,
    pull: pullCommand,
  },
});
