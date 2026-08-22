import { pinecone, pineconeIndex, docNamespace, CHUNK_FILTER_SCHEMA, type ChunkMetadata } from "../config/pinecone";
import { logger } from "../utils/logger";

const UPSERT_BATCH = 100;
const TEXT_MAX = 4000;

export interface VectorChunk {
  id: string;
  index: number;
  content: string;
  tokenCount: number;
  page: number;
  values: number[];
}

async function ensureNamespace(ns: string): Promise<void> {
  const index = pineconeIndex();
  try {
    await index.createNamespace({
      name: ns,
      schema: CHUNK_FILTER_SCHEMA,
    });
  } catch {
    /* already exists */
  }
}

export async function upsertDocumentVectors(docId: string, chunks: VectorChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const index = pineconeIndex();
  const ns = docNamespace(docId);
  await ensureNamespace(ns);

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const slice = chunks.slice(i, i + UPSERT_BATCH);
    await index.upsert({
      namespace: ns,
      records: slice.map((c) => ({
        id: c.id,
        values: c.values,
        metadata: {
          documentId: docId,
          chunkIndex: c.index,
          page: c.page,
          tokenCount: c.tokenCount,
          text: c.content.slice(0, TEXT_MAX),
        } satisfies ChunkMetadata,
      })),
    });
  }

  logger.info("Pinecone upsert complete", { docId, namespace: ns, records: chunks.length, mode: "incremental" });
}

export async function deleteVectorIds(docId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const index = pineconeIndex();
  const ns = docNamespace(docId);
  try {
    await index.deleteMany({ ids, namespace: ns });
    logger.info("Pinecone ids deleted", { docId, namespace: ns, count: ids.length });
  } catch (err) {
    logger.warn("Pinecone deleteMany skipped", { docId, error: String(err) });
  }
}

export async function queryDocumentVectors(docId: string, vector: number[], topK = 20) {
  const index = pineconeIndex();
  const ns = docNamespace(docId);
  return index.query({
    namespace: ns,
    vector,
    topK,
    includeMetadata: true,
    includeValues: false,
    filter: { documentId: { $eq: docId } },
  });
}

export async function deleteDocumentVectors(docId: string): Promise<void> {
  const index = pineconeIndex();
  const ns = docNamespace(docId);
  try {
    await index.deleteNamespace(ns);
    logger.info("Pinecone namespace deleted", { docId, namespace: ns });
  } catch (err) {
    logger.warn("Pinecone deleteNamespace skipped", { docId, error: String(err) });
  }
}

export async function pineconeStats() {
  return pineconeIndex().describeIndexStats();
}

/**
 * Hosted rerank (pinecone-rerank-v0, fall back to bge-reranker-v2-m3).
 * Returns ids in relevance order; on failure returns the original order.
 */
export async function rerankChunks(
  query: string,
  docs: { id: string; content: string }[],
  topN: number,
): Promise<{ id: string; score: number }[]> {
  if (docs.length === 0) return [];
  const documents = docs.map((d) => ({ id: d.id, text: d.content.slice(0, 2000) }));
  const models = ["pinecone-rerank-v0", "bge-reranker-v2-m3"];
  for (const model of models) {
    try {
      const result = await pinecone.inference.rerank({
        model,
        query,
        documents,
        topN: Math.min(topN, docs.length),
        returnDocuments: false,
        rankFields: ["text"],
        parameters: { truncate: "END" },
      });
      const ranked = (result.data ?? [])
        .map((row) => {
          const src = docs[row.index];
          return src ? { id: src.id, score: row.score ?? 0 } : null;
        })
        .filter((x): x is { id: string; score: number } => x !== null);
      if (ranked.length > 0) {
        logger.info("Pinecone rerank applied", { model, in: docs.length, out: ranked.length });
        return ranked;
      }
    } catch (err) {
      logger.warn("Pinecone rerank failed, trying next model", { model, error: String(err) });
    }
  }
  return docs.slice(0, topN).map((d, i) => ({ id: d.id, score: 1 - i * 0.01 }));
}
