/**
 * Markdown document parser.
 * Splits on headings to produce structured sections.
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { DocumentParser, ParsedDocument, DocumentSection } from '../types/index.js';

const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

export function createMarkdownParser(): DocumentParser {
  return {
    extensions: ['.md', '.markdown'],

    async parse(filePath: string): Promise<ParsedDocument> {
      const rawText = readFileSync(filePath, 'utf-8');
      const sections: DocumentSection[] = [];

      // Find all heading positions
      const headings: Array<{ level: number; text: string; index: number }> = [];
      let match: RegExpExecArray | null;
      while ((match = HEADING_RE.exec(rawText)) !== null) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          index: match.index,
        });
      }

      if (headings.length === 0) {
        // No headings — single section
        sections.push({
          content: rawText,
          charStart: 0,
          charEnd: rawText.length,
        });
      } else {
        // Content before first heading
        if (headings[0].index > 0) {
          const content = rawText.slice(0, headings[0].index).trim();
          if (content.length > 0) {
            sections.push({
              content,
              charStart: 0,
              charEnd: headings[0].index,
            });
          }
        }

        // Each heading starts a section
        for (let i = 0; i < headings.length; i++) {
          const start = headings[i].index;
          const end = i + 1 < headings.length ? headings[i + 1].index : rawText.length;
          const content = rawText.slice(start, end).trim();

          sections.push({
            heading: headings[i].text,
            content,
            charStart: start,
            charEnd: end,
          });
        }
      }

      // Title: first H1, or filename
      const h1 = headings.find(h => h.level === 1);
      const title = h1?.text ?? basename(filePath, extname(filePath));

      return {
        filePath,
        title,
        rawText,
        sections,
      };
    },
  };
}
