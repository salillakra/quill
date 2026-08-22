import { ai, embedLive } from "../config/gemini";
import { isDemoMode } from "../config/env";
import { prisma } from "../config/db";
import { embedText } from "../lib/demo";
import type { Chunk } from "./chunker.service";
import { deleteVectorIds, upsertDocumentVectors } from "./pinecone.service";
import { logger } from "../utils/logger";

function contentHash(text: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex").slice(0, 32);
}

async function embedOne(text: string): Promise<number[]> {
  if (!isDemoMode && ai) return embedLive(text, "RETRIEVAL_DOCUMENT");
  return embedText(text);
}

/**
 * Persist chunk text in Postgres and dense vectors in Pinecone.
 * Unchanged content (same index + hash) is skipped; removed indexes
 * are deleted from both stores. First ingest still upserts everything.
 */
export async function embedChunks(docId: string, chunks: Chunk[]): Promise<number> {
  const existing = await prisma.chunk.findMany({ where: { documentId: docId } });
  const byIndex = new Map(existing.map((row) => [row.index, row]));
  const keepIds = new Set<string>();
  const toUpsert: { id: string; index: number; content: string; tokenCount: number; page: number; values: number[] }[] = [];

  for (const chunk of chunks) {
    const hash = contentHash(chunk.content);
    const prev = byIndex.get(chunk.index);
    if (prev && prev.contentHash === hash && prev.content === chunk.content) {
      keepIds.add(prev.id);
      continue;
    }
    if (prev) {
      const values = await embedOne(chunk.content);
      const row = await prisma.chunk.update({
        where: { id: prev.id },
        data: {
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          page: chunk.page,
          contentHash: hash,
        },
      });
      keepIds.add(row.id);
      toUpsert.push({
        id: row.id,
        index: row.index,
        content: row.content,
        tokenCount: row.tokenCount,
        page: row.page,
        values,
      });
    } else {
      const values = await embedOne(chunk.content);
      const row = await prisma.chunk.create({
        data: {
          index: chunk.index,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          page: chunk.page,
          contentHash: hash,
          documentId: docId,
        },
      });
      keepIds.add(row.id);
      toUpsert.push({
        id: row.id,
        index: row.index,
        content: row.content,
        tokenCount: row.tokenCount,
        page: row.page,
        values,
      });
    }
  }

  const removed = existing.filter((row) => !keepIds.has(row.id));
  if (removed.length > 0) {
    await deleteVectorIds(docId, removed.map((row) => row.id));
    await prisma.chunk.deleteMany({ where: { id: { in: removed.map((row) => row.id) } } });
  }

  if (toUpsert.length > 0) {
    await upsertDocumentVectors(docId, toUpsert);
  }

  logger.info("Chunks embedded", {
    docId,
    incoming: chunks.length,
    upserted: toUpsert.length,
    reused: keepIds.size - toUpsert.length,
    removed: removed.length,
    store: "pinecone",
    demo: isDemoMode,
  });
  return chunks.length;
}
