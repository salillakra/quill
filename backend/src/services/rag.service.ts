import { ai, embedLive, models } from "../config/gemini";
import { isDemoMode } from "../config/env";
import { prisma } from "../config/db";
import { embedText } from "../lib/demo";
import { buildRagSystemPrompt, buildRagUserPrompt } from "../prompts";
import { demoAnswer } from "./demo-ai.service";
import { queryDocumentVectors, rerankChunks } from "./pinecone.service";
import { AppError } from "../middleware/error";

export interface AskSource {
  chunkId: string;
  page: number;
  score: number;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
  latencyMs: number;
  model: string;
  demo: boolean;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  page: number;
  score: number;
}

export function askModelLabel(): string {
  return isDemoMode ? "demo-pinecone-rrf" : `${models.generate} (Pinecone + RRF + rerank)`;
}

export function toAskSources(top: RetrievedChunk[]): AskSource[] {
  return top.map((c) => ({
    chunkId: c.id,
    page: c.page,
    score: Math.round(c.score * 1000) / 1000,
    excerpt: c.content.slice(0, 220),
  }));
}

/** Hybrid RAG: Pinecone ANN + lexical ILIKE + RRF, then hosted rerank. */
export async function retrieveChunks(docId: string, question: string): Promise<RetrievedChunk[]> {
  const queryVec = !isDemoMode && ai ? await embedLive(question, "RETRIEVAL_QUERY") : embedText(question);

  const pineconeRes = await queryDocumentVectors(docId, queryVec, 20);
  const matchIds = (pineconeRes.matches ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  const dbRows = matchIds.length > 0 ? await prisma.chunk.findMany({ where: { id: { in: matchIds } } }) : [];
  const byId = new Map(dbRows.map((r) => [r.id, r]));

  const vectorResults = (pineconeRes.matches ?? []).flatMap((m) => {
    if (!m.id) return [];
    const row = byId.get(m.id);
    const content = row?.content ?? m.metadata?.text;
    if (!content) return [];
    return [
      {
        id: m.id,
        content,
        page: row?.page ?? m.metadata?.page ?? 1,
        vecScore: m.score ?? 0,
      },
    ];
  });

  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let keywordResults: { id: string; content: string; page: number }[] = [];
  if (keywords.length > 0) {
    const searchPattern = `%${keywords.slice(0, 3).join("%")}%`;
    keywordResults = await prisma.$queryRaw<{ id: string; content: string; page: number }[]>`
      SELECT id, content, page
      FROM "Chunk"
      WHERE "documentId" = ${docId} AND "content" ILIKE ${searchPattern}
      LIMIT 10
    `;
  }

  if (vectorResults.length === 0 && keywordResults.length === 0) {
    throw new AppError(404, "No indexed content for this document yet — re-run ingest first.");
  }

  const K = 60;
  const scoreMap = new Map<string, RetrievedChunk>();

  vectorResults.forEach((item, rank) => {
    const rrf = 1 / (K + rank + 1);
    scoreMap.set(item.id, {
      id: item.id,
      content: item.content,
      page: item.page,
      score: rrf + item.vecScore * 0.5,
    });
  });

  keywordResults.forEach((item, rank) => {
    const rrf = 1 / (K + rank + 1);
    if (scoreMap.has(item.id)) {
      scoreMap.get(item.id)!.score += rrf;
    } else {
      scoreMap.set(item.id, { id: item.id, content: item.content, page: item.page, score: rrf });
    }
  });

  const fused = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const ranked = await rerankChunks(
    question,
    fused.map((c) => ({ id: c.id, content: c.content })),
    6,
  );
  const fusedById = new Map(fused.map((c) => [c.id, c]));
  return ranked.flatMap((r) => {
    const c = fusedById.get(r.id);
    return c ? [{ ...c, score: r.score }] : [];
  });
}

function chunkDemoText(text: string, size = 14): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

export async function* streamAnswerText(question: string, top: RetrievedChunk[]): AsyncGenerator<string> {
  if (!isDemoMode && ai) {
    const excerpts = top.map((c, i) => ({ index: i + 1, content: c.content }));
    const stream = await ai.models.generateContentStream({
      model: models.generate,
      contents: [{ role: "user", parts: [{ text: buildRagUserPrompt(question, excerpts) }] }],
      config: { systemInstruction: buildRagSystemPrompt() },
    });
    let prev = "";
    for await (const chunk of stream) {
      const full = chunk.text ?? "";
      if (!full) continue;
      if (full.startsWith(prev)) {
        const delta = full.slice(prev.length);
        prev = full;
        if (delta) yield delta;
      } else {
        yield full;
        prev += full;
      }
    }
    return;
  }

  const full = demoAnswer(question, top);
  for (const piece of chunkDemoText(full)) {
    await Bun.sleep(16);
    yield piece;
  }
}

export async function persistAskLog(opts: {
  docId: string;
  question: string;
  answer: string;
  sources: AskSource[];
  latencyMs: number;
  model: string;
}) {
  await prisma.queryLog.create({
    data: {
      documentId: opts.docId,
      question: opts.question,
      answer: opts.answer,
      latencyMs: opts.latencyMs,
      model: opts.model,
      sources: opts.sources as unknown as object,
    },
  });
}

/** Hybrid RAG: Pinecone ANN + lexical RRF + rerank → grounded generation → audit log */
export async function askDocument(docId: string, question: string): Promise<AskResult> {
  const t0 = performance.now();
  const top = await retrieveChunks(docId, question);
  const sources = toAskSources(top);

  let answer = "";
  for await (const delta of streamAnswerText(question, top)) answer += delta;
  if (!answer) answer = "No answer generated.";

  const latencyMs = Math.round(performance.now() - t0);
  const model = askModelLabel();
  await persistAskLog({ docId, question, answer, sources, latencyMs, model });
  return { answer, sources, latencyMs, model, demo: isDemoMode };
}
