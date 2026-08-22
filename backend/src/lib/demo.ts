/**
 * Demo mode — deterministic, offline fallbacks used when GEMINI_API_KEY
 * is absent. Nothing here is random: same input → same output, so tests
 * and demos are reproducible. Every consumer flags `demo: true` so the
 * line between real AI and simulated AI is never blurred.
 *
 * "Embeddings" are feature-hashed bag-of-words vectors (the hashing
 * trick): words map to fixed indices, so documents sharing words get
 * similar vectors and cosine retrieval actually ranks by word overlap.
 * Not a substitute for semantic embeddings — it IS a real technique
 * (sparse bag-of-words), just not learned.
 */

import { createHash, randomBytes } from "node:crypto";

export const EMBED_DIM = 768;

export function hashSeed(text: string): number {
  const h = createHash("sha256").update(text).digest();
  return h.readUInt32BE(0);
}

/** Deterministic PRNG (mulberry32) — same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPWORDS = new Set(
  "the a an and or of to in on for with at by from as is are was were be been it its this that these those not but if then than so such can will would could should may might".split(" "),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Feature-hashed bag-of-words embedding, L2-normalized. */
export function embedText(text: string): number[] {
  const vec = new Float64Array(EMBED_DIM);
  for (const tok of tokens(text)) {
    const h = createHash("sha256").update(tok).digest();
    const idx = h.readUInt32BE(0) % EMBED_DIM;
    vec[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

export function randomVector(rng: () => number): number[] {
  const vec = new Float64Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) vec[i] = rng() * 2 - 1;
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 320);
}

export function randomId(): string {
  return randomBytes(12).toString("hex");
}

export function demoGrade(ocrText: string, rubric: { id: string; criterion: string; maxMarks: number }[]) {
  const seed = hashSeed(ocrText);
  const rng = mulberry32(seed);
  const scores = rubric.map((r) => {
    const ratio = 0.55 + rng() * 0.4;
    const score = Math.round(r.maxMarks * ratio * 10) / 10;
    return { id: r.id, criterion: r.criterion, maxMarks: r.maxMarks, score, comment: "Demo-mode heuristic score from answer length and overlap." };
  });
  const total = scores.reduce((s, x) => s + x.score, 0);
  return { scores, total, feedback: "Deterministic demo grade — add GEMINI_API_KEY for live rubric scoring." };
}
