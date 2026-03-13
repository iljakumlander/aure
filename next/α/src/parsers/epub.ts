/**
 * EPUB document parser.
 * Uses epub2 to extract chapters, strips HTML to plain text.
 */

import { basename, extname } from 'node:path';
import _epub2 from 'epub2';
// epub2 ESM default export is { EPub, SYMBOL_RAW_DATA, default }
const EPub = _epub2.EPub ?? _epub2;
import type { DocumentParser, ParsedDocument, DocumentSection } from '../types/index.js';

const HTML_TAG_RE = /(<([^>]+)>)/gi;
const WHITESPACE_RE = /[ \t]+/g;
const BLANK_LINES_RE = /\n{3,}/g;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(HTML_TAG_RE, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(WHITESPACE_RE, ' ')
    .replace(BLANK_LINES_RE, '\n\n')
    .trim();
}

export function createEpubParser(): DocumentParser {
  return {
    extensions: ['.epub'],

    async parse(filePath: string): Promise<ParsedDocument> {
      const epub = await EPub.createAsync(filePath);

      const title: string =
        epub.metadata?.title || basename(filePath, extname(filePath));

      const sections: DocumentSection[] = [];
      const textParts: string[] = [];
      let charOffset = 0;

      // Build a lookup from id → toc title
      const tocTitles = new Map<string, string>();
      if (epub.toc) {
        for (const entry of epub.toc) {
          if (entry.id && entry.title) {
            tocTitles.set(entry.id, entry.title);
          }
        }
      }

      // Iterate chapters in reading order (flow/spine)
      const chapters: Array<{ id: string }> = epub.flow ?? [];

      for (const chapter of chapters) {
        let html: string;
        try {
          html = await epub.getChapterAsync(chapter.id);
        } catch {
          // Some chapters may fail (images, etc.) — skip
          continue;
        }

        const text = stripHtml(html);
        if (!text) continue;

        const heading = tocTitles.get(chapter.id);
        const charStart = charOffset;
        const charEnd = charOffset + text.length;

        sections.push({
          heading,
          content: text,
          charStart,
          charEnd,
        });

        textParts.push(text);
        charOffset = charEnd + 1; // +1 for joining newline
      }

      const rawText = textParts.join('\n');

      return {
        filePath,
        title,
        rawText,
        sections,
      };
    },
  };
}
