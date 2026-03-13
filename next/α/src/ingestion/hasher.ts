/**
 * SHA-256 hashing utilities for file content and document IDs.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}
