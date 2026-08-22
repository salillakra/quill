/**
 * Paragraph-aware chunking with overlap and page provenance.
 *
 * - Splits on blank-line paragraph boundaries (never mid-sentence when avoidable)
 * - Carries an overlap tail so no context is lost at chunk seams
 * - Tracks the source page via "[Page N]" markers emitted by the OCR layer,
 *   which powers citations in RAG answers
 */

export interface Chunk {
  index: number;
  content: string;
  page: number;
  tokenCount: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // ~4 chars/token, good enough for budgets
}

const PAGE_MARKER = /^\[Page (\d+)\]/;

export function chunkText(
  text: string,
  opts: { maxChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const maxChars = opts.maxChars ?? 4000; // ≈1000 tokens
  const overlapChars = opts.overlapChars ?? 200;
  const blocks = text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let current = "";
  let pendingTail = "";
  let page = 1; // page of the block being processed
  let chunkPage = 1; // page of the first block in the current chunk

  const flush = () => {
    if (!current) return;
    chunks.push({ index: chunks.length, content: current, page: chunkPage, tokenCount: estimateTokens(current) });
  };

  for (const rawBlock of blocks) {
    const marker = rawBlock.match(PAGE_MARKER);
    if (marker) {
      page = Number(marker[1]);
    }
    // Strip the marker from the content itself (it's metadata, not prose)
    const block = marker ? rawBlock.replace(PAGE_MARKER, "").trim() : rawBlock;

    if (block.length > maxChars) {
      // Oversized block: hard-split with overlap
      flush();
      current = "";
      pendingTail = "";
      for (let i = 0; i < block.length; i += maxChars - overlapChars) {
        const piece = block.slice(i, i + maxChars);
        chunks.push({ index: chunks.length, content: piece, page, tokenCount: estimateTokens(piece) });
      }
      continue;
    }

    if (current && current.length + block.length + 2 > maxChars) {
      flush();
      // Overlap: keep the last ~overlapChars of the flushed chunk, cut at
      // the first word boundary at/after the start so we never split a word.
      const start = Math.max(0, current.length - overlapChars);
      const boundary = current.indexOf(" ", start);
      pendingTail = boundary === -1 ? current.slice(start) : current.slice(boundary + 1);
      current = "";
    }

    if (current === "") {
      chunkPage = page; // page is captured when the chunk starts
      current = pendingTail ? `${pendingTail}\n\n${block}` : block;
      pendingTail = "";
    } else {
      current = `${current}\n\n${block}`;
    }
  }
  flush();
  return chunks;
}
