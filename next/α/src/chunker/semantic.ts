/**
 * Semantic chunker.
 * Splits at section/paragraph boundaries, falls back to fixed for oversized blocks.
 */

import { basename } from 'node:path';
import type { ParsedDocument, ChunkMetadata, DocumentSection } from '../types/index.js';
import type { ChunkingConfig } from '../types/config.js';
import { estimateTokens } from './tokens.js';

/**
 * Split a block of text at paragraph boundaries (double newline).
 */
function splitParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

/**
 * Force-split a large paragraph into maxTokens-sized pieces.
 */
function forceSplit(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const wordsPerChunk = Math.floor(maxTokens / 1.3);
  const pieces: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    pieces.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  return pieces;
}

export function createSemanticChunker(config: ChunkingConfig) {
  // Reserve room for overlap so chunks + overlap stay within maxTokens
  const effectiveMax = config.maxTokens - config.overlap;

  return {
    chunk(doc: ParsedDocument): ChunkMetadata[] {
      const fileName = basename(doc.filePath);
      const chunks: ChunkMetadata[] = [];
      let chunkIndex = 0;

      for (const section of doc.sections) {
        const sectionTokens = estimateTokens(section.content);

        if (sectionTokens <= effectiveMax) {
          // Section fits in one chunk
          chunks.push({
            filePath: doc.filePath,
            fileName,
            pageNumber: section.pageNumber,
            sectionHeading: section.heading,
            charStart: section.charStart,
            charEnd: section.charEnd,
            chunkIndex: chunkIndex++,
            text: section.content.trim(),
          });
          continue;
        }

        // Split section into paragraphs
        const paragraphs = splitParagraphs(section.content);
        let accumulated: string[] = [];
        let accumulatedTokens = 0;
        let blockStart = section.charStart;

        for (const paragraph of paragraphs) {
          const paraTokens = estimateTokens(paragraph);

          if (paraTokens > effectiveMax) {
            // Flush accumulated
            if (accumulated.length > 0) {
              const text = accumulated.join('\n\n').trim();
              const charStart = doc.rawText.indexOf(text, blockStart);
              chunks.push({
                filePath: doc.filePath,
                fileName,
                pageNumber: section.pageNumber,
                sectionHeading: section.heading,
                charStart: charStart >= 0 ? charStart : blockStart,
                charEnd: (charStart >= 0 ? charStart : blockStart) + text.length,
                chunkIndex: chunkIndex++,
                text,
              });
              accumulated = [];
              accumulatedTokens = 0;
            }

            // Force-split the oversized paragraph
            const pieces = forceSplit(paragraph, effectiveMax);
            for (const piece of pieces) {
              const charStart = doc.rawText.indexOf(piece, blockStart);
              chunks.push({
                filePath: doc.filePath,
                fileName,
                pageNumber: section.pageNumber,
                sectionHeading: section.heading,
                charStart: charStart >= 0 ? charStart : blockStart,
                charEnd: (charStart >= 0 ? charStart : blockStart) + piece.length,
                chunkIndex: chunkIndex++,
                text: piece,
              });
              if (charStart >= 0) blockStart = charStart + piece.length;
            }
            continue;
          }

          if (accumulatedTokens + paraTokens > effectiveMax && accumulated.length > 0) {
            // Flush accumulated
            const text = accumulated.join('\n\n').trim();
            const charStart = doc.rawText.indexOf(text, blockStart);
            chunks.push({
              filePath: doc.filePath,
              fileName,
              pageNumber: section.pageNumber,
              sectionHeading: section.heading,
              charStart: charStart >= 0 ? charStart : blockStart,
              charEnd: (charStart >= 0 ? charStart : blockStart) + text.length,
              chunkIndex: chunkIndex++,
              text,
            });
            blockStart = charStart >= 0 ? charStart + text.length : blockStart;
            accumulated = [];
            accumulatedTokens = 0;
          }

          accumulated.push(paragraph.trim());
          accumulatedTokens += paraTokens;
        }

        // Flush remaining
        if (accumulated.length > 0) {
          const text = accumulated.join('\n\n').trim();
          const charStart = doc.rawText.indexOf(text, blockStart);
          chunks.push({
            filePath: doc.filePath,
            fileName,
            pageNumber: section.pageNumber,
            sectionHeading: section.heading,
            charStart: charStart >= 0 ? charStart : blockStart,
            charEnd: (charStart >= 0 ? charStart : blockStart) + text.length,
            chunkIndex: chunkIndex++,
            text,
          });
        }
      }

      // Add overlap between consecutive chunks
      if (config.overlap > 0 && chunks.length > 1) {
        const overlapWords = Math.ceil(config.overlap / 1.3);
        for (let i = 1; i < chunks.length; i++) {
          const prevWords = chunks[i - 1].text.split(/\s+/);
          const overlapText = prevWords.slice(-overlapWords).join(' ');
          if (!chunks[i].text.startsWith(overlapText)) {
            chunks[i] = {
              ...chunks[i],
              text: overlapText + ' ' + chunks[i].text,
            };
          }
        }
      }

      return chunks;
    },
  };
}
