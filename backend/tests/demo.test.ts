import { describe, expect, test } from "bun:test";
import { embedText, cosine, mulberry32, hashSeed } from "../src/lib/demo";
import { demoExtractTimetable, demoGeneratePaper } from "../src/services/demo-ai.service";

describe("demo embeddings (feature hashing)", () => {
  test("deterministic: same text → same vector", () => {
    const a = embedText("digital signal processing filters");
    const b = embedText("digital signal processing filters");
    expect(a).toEqual(b);
  });

  test("similar text gets higher cosine similarity than unrelated text", () => {
    const v1 = embedText("the z-transform and fourier analysis of signals");
    const v2 = embedText("z-transform fourier analysis signal processing");
    const v3 = embedText("cooking recipes for pasta and pizza");
    expect(cosine(v1, v2)).toBeGreaterThan(cosine(v1, v3));
  });

  test("vectors are unit-length and 768-dim", () => {
    const v = embedText("anything");
    expect(v).toHaveLength(768);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test("mulberry32 is deterministic per seed", () => {
    expect(mulberry32(42)()).toBe(mulberry32(42)());
    expect(hashSeed("same")).toBe(hashSeed("same"));
  });
});

describe("demoExtractTimetable", () => {
  const SAMPLE = `CSE - Semester 3 - Section A
Branch: CSE
Semester: 3
Section: A

Monday
1-2: CS303 Data Structures - L1 - Dr. Meera Nair
3: CS305 Database Systems - L2 - Dr. Rohan Gupta

Tuesday
1: CS307 Computer Networks - L3 - Dr. Kavita Rao
`;

  test("parses branch, semester, section", () => {
    const tt = demoExtractTimetable(SAMPLE);
    expect(tt.branch).toBe("CSE");
    expect(tt.semester).toBe(3);
    expect(tt.section).toBe("A");
  });

  test("expands period ranges and extracts course/room/faculty", () => {
    const tt = demoExtractTimetable(SAMPLE);
    const monday = tt.rows.filter((r) => r.day === 0);
    expect(monday).toHaveLength(3); // 1-2 expands to periods 1 and 2, plus period 3
    expect(monday[0]).toMatchObject({ period: 1, course: "Data Structures", code: "CS303", room: "L1", faculty: "Dr. Meera Nair" });
    expect(monday[1].period).toBe(2);
    expect(monday[2]).toMatchObject({ period: 3, course: "Database Systems" });
  });

  test("throws when no timetable rows found", () => {
    expect(() => demoExtractTimetable("just a normal paragraph of text without any days or periods.")).toThrow();
  });
});

describe("demoGeneratePaper", () => {
  const CONTENT = "Digital signal processing is the mathematics of manipulating signals. The fast Fourier transform computes the discrete Fourier transform efficiently. Filter design shapes the frequency response of a system. Sampling converts analog signals into digital sequences. Aliasing occurs when the sampling rate is too low.";

  test("produces the requested number of questions", () => {
    const paper = demoGeneratePaper(CONTENT, {
      title: "DSP Test",
      questionTypes: ["MCQ", "SHORT_ANSWER", "LONG_ANSWER"],
      numberOfQuestions: 12,
      totalMarks: 50,
      difficulty: "MEDIUM",
    });
    const total = paper.sections.reduce((s, sec) => s + sec.questions.length, 0);
    expect(total).toBe(12);
  });

  test("marks sum exactly to totalMarks", () => {
    const paper = demoGeneratePaper(CONTENT, {
      title: "DSP Test",
      questionTypes: ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "LONG_ANSWER"],
      numberOfQuestions: 10,
      totalMarks: 40,
      difficulty: "HARD",
    });
    const sum = paper.sections.reduce((s, sec) => s + sec.questions.reduce((a, q) => a + q.marks, 0), 0);
    expect(sum).toBe(40);
  });

  test("MCQs carry 4 options", () => {
    const paper = demoGeneratePaper(CONTENT, {
      title: "MCQ only",
      questionTypes: ["MCQ"],
      numberOfQuestions: 4,
      totalMarks: 8,
      difficulty: "EASY",
    });
    const mcqs = paper.sections.flatMap((s) => s.questions).filter((q) => q.type === "MCQ");
    expect(mcqs.length).toBeGreaterThan(0);
    for (const q of mcqs) expect(q.options?.length).toBe(4);
  });
});
