/**
 * `aure init` command.
 * Sets up the working directory with config and reference folder.
 */

import { defineCommand } from 'citty';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import YAML from 'yaml';
import { getPreset } from '../config/presets.js';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Set up config, create directories, show setup instructions',
  },
  args: {
    preset: {
      type: 'string',
      description: 'Hardware preset: pi5, m-series, gpu, custom',
      default: 'pi5',
    },
    dir: {
      type: 'string',
      description: 'Target directory (default: current directory)',
      default: '.',
    },
  },
  run({ args }) {
    const dir = resolve(args.dir);
    const configPath = join(dir, 'config.yaml');
    const refPath = join(dir, 'reference');

    let preset;
    try {
      preset = getPreset(args.preset);
    } catch {
      console.error(`Error: Unknown preset "${args.preset}". Valid presets: pi5, m-series, gpu, custom`);
      process.exit(1);
    }

    const presetLabels: Record<string, string> = {
      pi5: 'Pi 5 (ARM64, conservative memory)',
      'm-series': 'M-Series Mac (Apple Silicon, unified memory)',
      gpu: 'GPU / Cloud (NVIDIA or cloud instance)',
      custom: 'Custom (Pi 5 defaults as base)',
    };

    console.log('');
    console.log('  Aure α — RAG Engine Setup');
    console.log('');
    console.log(`  Preset: ${presetLabels[args.preset] ?? args.preset}`);
    console.log('');

    // Create reference/ directory
    if (!existsSync(refPath)) {
      mkdirSync(refPath, { recursive: true });
      console.log('  ✓ Created reference/ directory');
    } else {
      console.log('  · reference/ directory already exists');
    }

    // Write config.yaml
    if (!existsSync(configPath)) {
      const { preset: _name, ...sections } = preset;
      const configContent = YAML.stringify({
        preset: args.preset,
        ...sections,
      });
      const header = '# Aure α configuration\n# See PROSPECT.md for full documentation\n\n';
      writeFileSync(configPath, header + configContent, 'utf-8');
      console.log(`  ✓ Created config.yaml with ${args.preset} defaults`);
    } else {
      console.log('  · config.yaml already exists (not overwritten)');
    }

    console.log('');
    console.log(`  Pull embedding model: ollama pull ${preset.embedding.model}`);
    console.log('  Ready. Drop documents into reference/ and run `aure ingest`.');
    console.log('');
  },
});
