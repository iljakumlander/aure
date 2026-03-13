/**
 * Parser registry.
 * Maps file extensions to document parsers.
 */

import { extname } from 'node:path';
import type { DocumentParser } from '../types/index.js';
import { createPlaintextParser } from './plaintext.js';
import { createMarkdownParser } from './markdown.js';
import { createPdfParser } from './pdf.js';
import { createEpubParser } from './epub.js';

export function createDefaultParsers(): DocumentParser[] {
  return [
    createPlaintextParser(),
    createMarkdownParser(),
    createPdfParser(),
    createEpubParser(),
  ];
}

export function getParserForFile(filePath: string, parsers: DocumentParser[]): DocumentParser | undefined {
  const ext = extname(filePath).toLowerCase();
  return parsers.find(p => p.extensions.includes(ext));
}

export { createPlaintextParser } from './plaintext.js';
export { createMarkdownParser } from './markdown.js';
export { createPdfParser } from './pdf.js';
export { createEpubParser } from './epub.js';
