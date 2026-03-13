/**
 * Fixed-size chunker.
 * Splits text into chunks of maxTokens with overlap.
 */

import { basename } from 'node:path';
import type { ParsedDocument, ChunkMetadata } from '../types/index.js';
import type { ChunkingConfig } from '../types/config.js';
import { estimateTokens } from './tokens.js';

/**
 * Split text into word-boundary-aligned chunks.
 * Returns array of { text, charStart, charEnd } relative to the source string.
 */
function splitText(
  text: string,
  maxTokens: number,
  overlap: number,
  respectBoundaries: boolean,
): Array<{ text: string; charStart: number; charEnd: number }> {
  const words = text.split(/(\s+)/); // keep whitespace as separators
  const chunks: Array<{ text: string; charStart: number; charEnd: number }> = [];

  let currentWords: string[] = [];
  let currentTokens = 0;
  let charPos = 0;
  let chunkStartChar = 0;

  for (const segment of words) {
    const isWhitespace = /^\s+$/.test(segment);
    const segTokens = isWhitespace ? 0 : estimateTokens(segment);

    if (!isWhitespace && currentTokens + segTokens > maxTokens && currentWords.length > 0) {
      // Flush current chunk
      let chunkText = currentWords.join('');

      // If respectBoundaries, try to break at last sentence end
      if (respectBoundaries) {
        const sentenceEnd = chunkText.lastIndexOf('. ');
        if (sentenceEnd > chunkText.length * 0.5) {
          const trimmedText = chunkText.slice(0, sentenceEnd + 1);
          chunkText = trimmedText;
        }
      }

      chunks.push({
        text: chunkText.trim(),
        charStart: chunkStartChar,
        charEnd: chunkStartChar + chunkText.trimEnd().length,
      });

      // Compute overlap: take last `overlap` tokens worth of words
      if (overlap > 0) {
        const allWords = currentWords.join('').split(/\s+/).filter(Boolean);
        const overlapWords = allWords.slice(-Math.ceil(overlap / 1.3));
        const overlapText = overlapWords.join(' ');
        const overlapStart = text.indexOf(overlapText, chunkStartChar);

        currentWords = [overlapText + ' '];
        currentTokens = estimateTokens(overlapText);
        chunkStartChar = overlapStart >= 0 ? overlapStart : charPos;
      } else {
        currentWords = [];
        currentTokens = 0;
        chunkStartChar = charPos;
      }
    }

    currentWords.push(segment);
    if (!isWhitespace) {
      currentTokens += segTokens;
    }
    charPos += segment.length;
  }

  // Flush remaining
  if (currentWords.length > 0) {
    const chunkText = currentWords.join('').trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        charStart: chunkStartChar,
        charEnd: chunkStartChar + chunkText.length,
      });
    }
  }

  return chunks;
}

export function createFixedChunker(config: ChunkingConfig) {
  return {
    chunk(doc: ParsedDocument): ChunkMetadata[] {
      const fileName = basename(doc.filePath);
      const rawChunks = splitText(
        doc.rawText,
        config.maxTokens,
        config.overlap,
        config.respectBoundaries,
      );

      return rawChunks.map((c, index) => {
        // Find which section this chunk falls in
        const section = doc.sections.find(
          s => c.charStart >= s.charStart && c.charStart < s.charEnd,
        );

        return {
          filePath: doc.filePath,
          fileName,
          pageNumber: section?.pageNumber,
          sectionHeading: section?.heading,
          charStart: c.charStart,
          charEnd: c.charEnd,
          chunkIndex: index,
          text: c.text,
        };
      });
    },
  };
}
