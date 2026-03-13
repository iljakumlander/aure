#!/usr/bin/env node

/**
 * Aure α CLI entry point.
 */

import { defineCommand, runMain } from 'citty';
import { initCommand } from './init.js';
import { statusCommand } from './status.js';
import { ingestCommand } from './ingest.js';
import { searchCommand } from './search.js';
import { presetCommand } from './preset.js';

const main = defineCommand({
  meta: {
    name: 'aure',
    version: '0.1.0',
    description: 'Aure α — RAG engine',
  },
  subCommands: {
    init: initCommand,
    ingest: ingestCommand,
    status: statusCommand,
    search: searchCommand,
    preset: presetCommand,
  },
});

runMain(main);
