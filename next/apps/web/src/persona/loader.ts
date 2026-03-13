/**
 * Persona loader — reads persona.yaml, merges with defaults.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { DEFAULT_PERSONA } from './default.js';
import type { Persona } from '../types/index.js';

function substitute(text: string, name: string): string {
  return text.replace(/\{\{name\}\}/g, name);
}

export function loadPersona(configDir: string): Persona {
  const personaPath = `${configDir}/persona.yaml`;

  let raw: Partial<Persona> = {};
  if (existsSync(personaPath)) {
    const content = readFileSync(personaPath, 'utf-8');
    raw = parse(content) ?? {};
  }

  const name = raw.name ?? DEFAULT_PERSONA.name;
  const systemPrompt = substitute(raw.systemPrompt ?? DEFAULT_PERSONA.systemPrompt, name);
  const instructions = substitute(raw.instructions ?? DEFAULT_PERSONA.instructions, name);
  const greeting = substitute(raw.greeting ?? DEFAULT_PERSONA.greeting, name);

  return { name, systemPrompt, instructions, greeting };
}
