import { Pinecone, type Index, type MetadataSchema } from "@pinecone-database/pinecone";
import { env } from "./env";
import { EMBED_DIM } from "../lib/demo";
import { logger } from "../utils/logger";

export type ChunkMetadata = {
  documentId: string;
  chunkIndex: number;
  page: number;
  tokenCount: number;
  text: string;
};

/** Only these metadata keys are indexed for `$eq` filters (Pinecone schema). */
export const CHUNK_FILTER_SCHEMA: MetadataSchema = {
  fields: {
    documentId: { filterable: true },
    page: { filterable: true },
    chunkIndex: { filterable: true },
  },
};

export const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });

export function docNamespace(docId: string): string {
  return `doc-${docId}`;
}

let indexHandle: Index<ChunkMetadata> | null = null;

export function pineconeIndex(): Index<ChunkMetadata> {
  if (!indexHandle) throw new Error("Pinecone index is not initialized — call ensurePineconeIndex() at boot");
  return indexHandle;
}

/**
 * Create the serverless cosine index if missing, wait until ready, then
 * bind a typed Index client to its host (required by the data-plane SDK).
 */
export async function ensurePineconeIndex(): Promise<Index<ChunkMetadata>> {
  const name = env.PINECONE_INDEX;
  const listed = await pinecone.listIndexes();
  const existing = listed.indexes?.find((i) => i.name === name);

  if (!existing) {
    logger.info("Creating Pinecone serverless index", {
      name,
      dimension: EMBED_DIM,
      cloud: env.PINECONE_CLOUD,
      region: env.PINECONE_REGION,
    });
    const base = {
      name,
      dimension: EMBED_DIM,
      metric: "cosine" as const,
      vectorType: "dense",
      waitUntilReady: true,
      suppressConflicts: true,
      timeout: 300_000,
      tags: { product: "quill", component: "rag" },
    };
    try {
      await pinecone.createIndex({
        ...base,
        spec: {
          serverless: {
            cloud: env.PINECONE_CLOUD,
            region: env.PINECONE_REGION,
            schema: CHUNK_FILTER_SCHEMA,
          },
        },
      });
    } catch (err) {
      logger.warn("Pinecone createIndex with metadata schema failed; retrying without schema", {
        error: String(err),
      });
      await pinecone.createIndex({
        ...base,
        spec: {
          serverless: {
            cloud: env.PINECONE_CLOUD,
            region: env.PINECONE_REGION,
          },
        },
      });
    }
  }

  const model = await pinecone.describeIndex(name);
  if (!model.host) throw new Error(`Pinecone index ${name} has no host`);
  if (model.dimension && model.dimension !== EMBED_DIM) {
    throw new Error(
      `Pinecone index ${name} dimension is ${model.dimension}, expected ${EMBED_DIM}. Delete or rename PINECONE_INDEX.`,
    );
  }
  indexHandle = pinecone.index<ChunkMetadata>({ name, host: model.host });
  logger.info("Pinecone index ready", { name, host: model.host, status: model.status?.state });
  return indexHandle;
}
