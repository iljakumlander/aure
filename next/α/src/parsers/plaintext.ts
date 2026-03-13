/**
 * Plain text document parser.
 * Reads file content as a single section.
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { DocumentParser, ParsedDocument } from '../types/index.js';

export function createPlaintextParser(): DocumentParser {
  return {
    extensions: ['.txt'],

    async parse(filePath: string): Promise<ParsedDocument> {
      const rawText = readFileSync(filePath, 'utf-8');
      const fileName = basename(filePath);
      const title = basename(filePath, extname(filePath));

      return {
        filePath,
        title,
        rawText,
        sections: [
          {
            content: rawText,
            charStart: 0,
            charEnd: rawText.length,
          },
        ],
      };
    },
  };
}
