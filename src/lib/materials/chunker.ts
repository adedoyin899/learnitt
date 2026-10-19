import { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS } from "./types";

export interface TextChunk {
  ordinal: number;
  content: string;
  tokens: number;
}

/**
 * Estimates token count for English/technical text (~4 characters per token).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Word count heuristic: 1 word ~ 1.33 tokens, or length / 4
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  return Math.max(1, Math.round(Math.max(words * 1.3, chars / 4)));
}

/**
 * Chunks extracted text into ~800 tokens with ~100 tokens overlap.
 * PRD Epic B1 & Prompt Requirement 3:
 * "Chunk to about 800 tokens with 100 overlap and store in material_chunks with the tsvector column."
 */
export function chunkText(
  text: string,
  options?: {
    targetTokens?: number;
    overlapTokens?: number;
  }
): TextChunk[] {
  const targetTokens = options?.targetTokens || CHUNK_TARGET_TOKENS; // 800
  const overlapTokens = options?.overlapTokens || CHUNK_OVERLAP_TOKENS; // 100

  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) return [];

  // Split on paragraph boundaries first, then sentence boundaries
  const paragraphs = cleanText.split(/\n\s*\n+/);
  const segments: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    // If paragraph itself is excessively large (> 400 tokens), break on sentences
    if (estimateTokenCount(trimmed) > 400) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [trimmed];
      for (const s of sentences) {
        const sTrimmed = s.trim();
        if (sTrimmed) segments.push(sTrimmed);
      }
    } else {
      segments.push(trimmed);
    }
  }

  if (segments.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentSegments: string[] = [];
  let currentTokenCount = 0;
  let ordinal = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segTokens = estimateTokenCount(seg);

    if (currentTokenCount + segTokens > targetTokens && currentSegments.length > 0) {
      // Complete current chunk
      const chunkText = currentSegments.join("\n\n");
      chunks.push({
        ordinal: ordinal++,
        content: chunkText,
        tokens: currentTokenCount,
      });

      // Retain segments from the end to form overlap (~100 tokens)
      const overlapSegments: string[] = [];
      let overlapCount = 0;
      for (let j = currentSegments.length - 1; j >= 0; j--) {
        const prevSeg = currentSegments[j];
        const prevTokens = estimateTokenCount(prevSeg);
        if (overlapCount + prevTokens <= overlapTokens || overlapSegments.length === 0) {
          overlapSegments.unshift(prevSeg);
          overlapCount += prevTokens;
        } else {
          break;
        }
      }

      currentSegments = [...overlapSegments, seg];
      currentTokenCount = overlapCount + segTokens;
    } else {
      currentSegments.push(seg);
      currentTokenCount += segTokens;
    }
  }

  // Push final remaining chunk
  if (currentSegments.length > 0) {
    const chunkText = currentSegments.join("\n\n");
    chunks.push({
      ordinal: ordinal++,
      content: chunkText,
      tokens: currentTokenCount,
    });
  }

  return chunks;
}
