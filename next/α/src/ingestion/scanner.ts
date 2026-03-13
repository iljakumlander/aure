/**
 * Directory scanner.
 * Finds supported document files in the reference directory.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export function scanDirectory(dir: string, supportedTypes: string[]): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!supportedTypes.includes(ext)) continue;

    const fullPath = join(entry.parentPath ?? entry.path, entry.name);
    files.push(fullPath);
  }

  return files.sort();
}
