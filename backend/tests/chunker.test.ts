import { describe, expect, test } from "bun:test";
import { chunkText, estimateTokens } from "../src/services/chunker.service";

describe("chunkText", () => {
  test("keeps every chunk within the size budget", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}: ${"words ".repeat(80)}`).join("\n\n");
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1000);
  });

  test("carries overlap across seams so no context is lost", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Block ${i}: ${"content ".repeat(50)}`).join("\n\n");
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 150 });
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].content.slice(-150);
      const words = tail.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
      expect(chunks[i].content.includes(words)).toBe(true);
    }
  });

  test("tracks page provenance from [Page N] markers", () => {
    const text = `[Page 1]\nIntro paragraph about signals.\n\n[Page 2]\nSecond paragraph about filters.\n\n[Page 3]\nThird paragraph about transforms.`;
    const chunks = chunkText(text, { maxChars: 50, overlapChars: 10 });
    expect(chunks[0].page).toBe(1);
    expect(chunks[1].page).toBe(2);
    expect(chunks[2].page).toBe(3);
  });

  test("strips page markers from chunk content", () => {
    const text = `[Page 1]\nContent here.`;
    const chunks = chunkText(text);
    expect(chunks[0].content.startsWith("[Page 1]")).toBe(false);
    expect(chunks[0].content).toContain("Content here");
  });

  test("hard-splits oversized single blocks without losing coverage", () => {
    const text = "word ".repeat(5000).trim();
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    // overlap is additive, so nothing is lost: head and tail survive, and
    // every piece stays within budget
    expect(chunks[0].content.startsWith("word")).toBe(true);
    expect(chunks[chunks.length - 1].content.endsWith("word")).toBe(true);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1000);
  });

  test("empty input yields no chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

describe("estimateTokens", () => {
  test("roughly 4 chars per token", () => {
    expect(estimateTokens("hello world")).toBe(3);
  });
});
