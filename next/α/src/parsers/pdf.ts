/**
 * PDF document parser.
 * Uses pdf-parse to extract text, splits on page breaks.
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
// @ts-expect-error pdf-parse has no type declarations
import pdfParse from 'pdf-parse';
import type { DocumentParser, ParsedDocument, DocumentSection } from '../types/index.js';

export function createPdfParser(): DocumentParser {
  return {
    extensions: ['.pdf'],

    async parse(filePath: string): Promise<ParsedDocument> {
      const buffer = readFileSync(filePath);
      const pdf = await pdfParse(buffer);

      const rawText: string = pdf.text;
      const pageCount: number = pdf.numpages;
      const title: string = pdf.info?.Title || basename(filePath, extname(filePath));

      // Split on form-feed characters (pdf-parse inserts them between pages)
      const pages = rawText.split('\f');
      const sections: DocumentSection[] = [];
      let charOffset = 0;

      for (let i = 0; i < pages.length; i++) {
        const content = pages[i].trim();
        if (content.length === 0) {
          // Account for the form-feed character
          charOffset += pages[i].length + 1;
          continue;
        }

        const charStart = rawText.indexOf(content, charOffset);
        const charEnd = charStart + content.length;

        sections.push({
          content,
          pageNumber: i + 1,
          charStart,
          charEnd,
        });

        // Move past this page + form-feed
        charOffset += pages[i].length + 1;
      }

      // Fallback: if no form-feeds found, single section
      if (sections.length === 0 && rawText.trim().length > 0) {
        sections.push({
          content: rawText.trim(),
          charStart: 0,
          charEnd: rawText.length,
        });
      }

      return {
        filePath,
        title,
        rawText,
        sections,
        pageCount,
      };
    },
  };
}
