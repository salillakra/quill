import { GoogleGenAI } from "@google/genai";
import { env, isDemoMode } from "./env";
import { EMBED_DIM } from "../lib/demo";

/**
 * Provider seam: the whole pipeline talks to this object.
 * In demo mode (no GEMINI_API_KEY) nothing here is used — services call
 * lib/demo.ts instead. Swap Gemini for any provider by implementing the
 * same three methods.
 */
export const ai = isDemoMode ? null : new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const RETIRED_GENERATE = new Set(["gemini-2.5-flash", "gemini-2.5-pro"]);

export const models = {
  // gemini-2.5-flash is blocked for new API keys; 3.5-flash is the current Flash GA.
  generate: RETIRED_GENERATE.has(env.GEMINI_MODEL) ? "gemini-3.5-flash" : env.GEMINI_MODEL,
  // text-embedding-004 was shut down 2026-01-14; ignore stale .env values.
  embed: env.GEMINI_EMBED_MODEL === "text-embedding-004" ? "gemini-embedding-001" : env.GEMINI_EMBED_MODEL,
};

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Live Gemini embedding, Matryoshka-truncated to EMBED_DIM (768) to match
 * the Pinecone dense index. gemini-embedding-001 defaults to 3072.
 */
export async function embedLive(text: string, taskType: EmbedTask): Promise<number[]> {
  if (!ai) throw new Error("embedLive called without a Gemini client");
  const res = await ai.models.embedContent({
    model: models.embed,
    contents: text,
    config: { outputDimensionality: EMBED_DIM, taskType },
  });
  return res.embeddings?.[0]?.values ?? [];
}
