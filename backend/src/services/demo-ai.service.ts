import {
  DAY_NAME_TO_INDEX,
  type GenericExtractionData,
  type TimetableData,
} from "../validators/extraction.validator";
import type { PaperConfig, PaperOutput } from "../validators/paper.validator";
import { hashSeed, mulberry32, sentences } from "../lib/demo";

/**
 * Deterministic, offline stand-ins for the Gemini calls. Same input →
 * same output. Flagged `demo: true` by every caller.
 */

export function demoExtractTimetable(text: string): TimetableData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: TimetableData["rows"] = [];
  let branch = "GENERAL";
  let semester = 1;
  let section: string | null = null;

  const br = text.match(/branch[:\s-]+([A-Z]{2,6})/i);
  if (br) branch = br[1].toUpperCase();
  const sem = text.match(/semester[:\s-]+(\d+)/i);
  if (sem) semester = Number(sem[1]);
  const sec = text.match(/section[:\s-]+([A-Za-z0-9])/i);
  if (sec) section = sec[1].toUpperCase();

  let currentDay: number | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const dayHit = Object.keys(DAY_NAME_TO_INDEX).find((name) => lower.startsWith(name));
    if (dayHit) {
      currentDay = DAY_NAME_TO_INDEX[dayHit];
      continue;
    }
    if (currentDay === null) continue;
    const periodMatch = line.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?[:\s]+(.+)$/);
    if (!periodMatch) continue;

    const p1 = Number(periodMatch[1]);
    const p2 = periodMatch[2] ? Number(periodMatch[2]) : p1;
    const rest = periodMatch[3];

    const codeMatch = rest.match(/\b([A-Z]{2,4}\s?\d{3})\b/);
    const roomMatch = rest.match(/\b([A-Z]\d{1,3})\b/);
    const facultyMatch = rest.match(/\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    const course = (rest
      .replace(codeMatch?.[0] ?? "", "")
      .replace(roomMatch?.[0] ?? "", "")
      .replace(facultyMatch?.[0] ?? "", "")
      .replace(/[-–]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Unknown");

    for (let p = p1; p <= Math.min(p2, 12); p++) {
      rows.push({
        day: currentDay,
        period: p,
        course,
        code: codeMatch?.[1] ?? null,
        room: roomMatch?.[1] ?? null,
        faculty: facultyMatch?.[1] ?? null,
      });
    }
  }

  if (rows.length === 0) {
    throw new Error("Demo extractor found no timetable rows (expected lines like '1-2: CS303 Data Structures - L1')");
  }
  return { branch, semester, section, rows };
}

export function demoExtractGeneric(text: string): GenericExtractionData {
  const entities: GenericExtractionData["entities"] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z][A-Za-z ]{2,24}?)[:\-]\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      if (!seen.has(key.toLowerCase())) {
        seen.add(key.toLowerCase());
        entities.push({ key, value: m[2].trim().slice(0, 160), confidence: 0.9 });
        if (entities.length >= 12) break;
      }
    }
  }
  const sents = sentences(text);
  return {
    summary: sents[0]?.slice(0, 240) ?? "No summary available (document is too short).",
    entities,
  };
}

const MARKS: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
  TRUE_FALSE: { EASY: 1, MEDIUM: 1, HARD: 2 },
  FILL_BLANK: { EASY: 1, MEDIUM: 2, HARD: 3 },
  SHORT_ANSWER: { EASY: 2, MEDIUM: 3, HARD: 4 },
  LONG_ANSWER: { EASY: 5, MEDIUM: 8, HARD: 10 },
  NUMERICAL: { EASY: 3, MEDIUM: 5, HARD: 8 },
  DIAGRAM: { EASY: 4, MEDIUM: 6, HARD: 8 },
  CASE_STUDY: { EASY: 5, MEDIUM: 10, HARD: 15 },
};

const BLOOMS_MAP: Record<string, ("REMEMBER" | "UNDERSTAND" | "APPLY" | "ANALYZE" | "EVALUATE" | "CREATE")[]> = {
  MCQ: ["REMEMBER", "UNDERSTAND"],
  TRUE_FALSE: ["REMEMBER", "UNDERSTAND"],
  FILL_BLANK: ["REMEMBER", "UNDERSTAND"],
  SHORT_ANSWER: ["UNDERSTAND", "APPLY"],
  LONG_ANSWER: ["APPLY", "ANALYZE", "EVALUATE"],
  NUMERICAL: ["APPLY", "ANALYZE"],
  DIAGRAM: ["UNDERSTAND", "APPLY", "CREATE"],
  CASE_STUDY: ["ANALYZE", "EVALUATE", "CREATE"],
};

export function demoGeneratePaper(content: string, config: PaperConfig): PaperOutput {
  const rng = mulberry32(hashSeed(`${config.title}|${content.slice(0, 600)}`));
  const sents = sentences(content);
  const pool = sents.length > 0 ? sents : [content.slice(0, 300) || "The document contains no extractable sentences."];
  const words = content.split(/\s+/).filter((w) => w.length > 4);

  const questions: PaperOutput["sections"][number]["questions"] = [];
  const types = config.questionTypes;

  const makeQuestion = (type: string, idx: number): PaperOutput["sections"][number]["questions"][number] => {
    const sentence = pool[Math.floor(rng() * pool.length)];
    const difficulty = config.difficulty === "EASY" || config.difficulty === "HARD" ? config.difficulty : (rng() < 0.5 ? "EASY" : "MEDIUM");
    const bloomsPool = BLOOMS_MAP[type] ?? ["UNDERSTAND"];
    const bloomsLevel = bloomsPool[Math.floor(rng() * bloomsPool.length)];

    switch (type) {
      case "MCQ": {
        const clause = sentence.slice(0, sentence.length - 1);
        const correct = sentence;
        const distractors = pool.filter((s) => s !== sentence).slice(0, 3);
        while (distractors.length < 3) distractors.push(`Option ${distractors.length + 1} statement`);
        const options = [correct, ...distractors].sort(() => rng() - 0.5);
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Which of the following statements is correct regarding: ${clause}…?`,
          difficulty: difficulty as any,
          marks: MARKS.MCQ[difficulty] ?? 2,
          type: "MCQ",
          bloomsLevel,
          options,
          answer: correct,
          solution: `Option matching "${correct}" is correct. It directly mirrors the source context on this topic.`,
          rubric: [
            `1 Mark for selecting the correct option (${correct.slice(0, 40)}...)`,
            `0 Marks for incorrect distractor selection`,
          ],
        };
      }
      case "TRUE_FALSE":
        const isTrue = rng() < 0.5;
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `State whether the following assertion is True or False: ${sentence}`,
          difficulty: difficulty as any,
          marks: MARKS.TRUE_FALSE[difficulty] ?? 1,
          type: "TRUE_FALSE",
          bloomsLevel,
          options: ["True", "False"],
          answer: isTrue ? "True" : "False",
          solution: `The statement is ${isTrue ? "True" : "False"}. ${sentence}`,
          rubric: [`Full credit (${MARKS.TRUE_FALSE[difficulty] ?? 1} mark) for identifying '${isTrue ? "True" : "False"}'`],
        };
      case "FILL_BLANK": {
        const masked = words.length > 0 ? sentence.replace(/\b\w{6,}\b/, "__________") : sentence;
        const targetWord = words[0] ?? "N/A";
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Fill in the blank: ${masked}`,
          difficulty: difficulty as any,
          marks: MARKS.FILL_BLANK[difficulty] ?? 2,
          type: "FILL_BLANK",
          bloomsLevel,
          answer: targetWord,
          solution: `The missing key term is "${targetWord}".`,
          rubric: [`${MARKS.FILL_BLANK[difficulty] ?? 2} Marks for exact or acceptable synonym of "${targetWord}"`],
        };
      }
      case "NUMERICAL":
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `A system processes a workload derived from: ${sentence.slice(0, 100)}. Given input parameter X = 42, calculate the resulting throughput assuming linear efficiency.`,
          difficulty: difficulty as any,
          marks: MARKS.NUMERICAL[difficulty] ?? 5,
          type: "NUMERICAL",
          bloomsLevel: "APPLY",
          answer: "Throughput = 42 * 1.5 = 63 units/sec",
          solution: "Step 1: Identify given value X = 42.\nStep 2: Apply conversion factor 1.5.\nStep 3: Result = 63 units/sec.",
          rubric: [
            "1 Mark for stating formula",
            "2 Marks for correct step-by-step substitution",
            "2 Marks for final numeric answer with units",
          ],
        };
      case "DIAGRAM":
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Draw an architecture block diagram or workflow flowchart explaining the following process: ${sentence}`,
          difficulty: difficulty as any,
          marks: MARKS.DIAGRAM[difficulty] ?? 6,
          type: "DIAGRAM",
          bloomsLevel: "CREATE",
          answer: "Architecture flowchart with Input, Processing Engine, Data Store, and Output nodes.",
          solution: "```mermaid\ngraph TD\n    A[Input Data] --> B[Processing Component]\n    B --> C[Data Store]\n    B --> D[Output Result]\n```",
          rubric: [
            "2 Marks for identifying input/output blocks",
            "2 Marks for correct directional flow arrows",
            "2 Marks for clear component labeling",
          ],
        };
      case "CASE_STUDY":
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Analyze the following scenario based on the course material: "${sentence}". Evaluate potential bottlenecks and propose an optimized implementation strategy.`,
          difficulty: difficulty as any,
          marks: MARKS.CASE_STUDY[difficulty] ?? 10,
          type: "CASE_STUDY",
          bloomsLevel: "EVALUATE",
          answer: "Comprehensive case study evaluation covering problem diagnosis, trade-off analysis, and recommended resolution.",
          solution: "1. Problem Identification: System throughput constraints.\n2. Root Cause Analysis: Resource contention.\n3. Recommendation: Implement caching and queue-based decoupling.",
          rubric: [
            "3 Marks for clear problem diagnosis",
            "3 Marks for trade-off evaluation",
            "4 Marks for actionable, well-justified solution",
          ],
        };
      case "SHORT_ANSWER":
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Explain briefly: ${sentence}`,
          difficulty: difficulty as any,
          marks: MARKS.SHORT_ANSWER[difficulty] ?? 3,
          type: "SHORT_ANSWER",
          bloomsLevel,
          answer: "Refer to the document section covering this topic.",
          solution: `Clear concise summary highlighting the key mechanism mentioned in: ${sentence.slice(0, 100)}`,
          rubric: [
            "1 Mark for stating core definition",
            "2 Marks for accurate technical explanation",
          ],
        };
      case "LONG_ANSWER":
      default:
        return {
          id: `q-${idx + 1}-${Date.now()}`,
          question: `Describe in detail, with examples from the material: ${sentence}`,
          difficulty: difficulty as any,
          marks: MARKS.LONG_ANSWER[difficulty] ?? 8,
          type: "LONG_ANSWER",
          bloomsLevel,
          answer: "Synthesize the relevant material from the document.",
          solution: `Comprehensive explanation covering:\n1. Theoretical background\n2. Key operational steps\n3. Practical applications derived from: ${sentence.slice(0, 120)}`,
          rubric: [
            "2 Marks for theoretical overview",
            "3 Marks for detailed step-by-step breakdown",
            "3 Marks for concrete examples and illustration",
          ],
        };
    }
  };

  // Round-robin allocation across requested types
  const perType = Math.floor(config.numberOfQuestions / types.length);
  let allocated = 0;
  for (let ti = 0; ti < types.length; ti++) {
    const count = ti < config.numberOfQuestions % types.length ? perType + 1 : perType;
    for (let i = 0; i < count; i++) questions.push(makeQuestion(types[ti], allocated + i));
    allocated += count;
  }
  while (allocated < config.numberOfQuestions) {
    questions.push(makeQuestion(types[allocated % types.length], allocated));
    allocated++;
  }

  // Adjust the last question's marks to hit totalMarks exactly
  const currentTotal = questions.reduce((s, q) => s + q.marks, 0);
  const diff = config.totalMarks - currentTotal;
  if (questions.length > 0 && diff !== 0) {
    questions[questions.length - 1].marks = Math.max(1, questions[questions.length - 1].marks + diff);
  }

  // Group into sections by objective/subjective split
  const sections: PaperOutput["sections"] = [];
  const objective = questions.filter((q) => ["MCQ", "TRUE_FALSE", "FILL_BLANK"].includes(q.type ?? ""));
  const short = questions.filter((q) => ["SHORT_ANSWER", "NUMERICAL"].includes(q.type ?? ""));
  const long = questions.filter((q) => ["LONG_ANSWER", "DIAGRAM", "CASE_STUDY"].includes(q.type ?? ""));

  if (objective.length) {
    sections.push({ title: "Section A — Objective & Conceptual", instruction: "Attempt all questions. Each question carries the marks indicated.", questions: objective });
  }
  if (short.length) {
    sections.push({ title: "Section B — Short Analytical & Numerical", instruction: "Answer all questions concise with working steps where required.", questions: short });
  }
  if (long.length) {
    sections.push({ title: "Section C — Detailed Applications & Case Studies", instruction: "Answer in detail, using diagrams and step-by-step reasoning.", questions: long });
  }
  if (sections.length === 0) {
    sections.push({ title: "Section A — Questions", instruction: "Answer all questions.", questions });
  }

  return { sections };
}

export function demoRegenerateQuestion(
  content: string,
  targetType: string = "SHORT_ANSWER",
  targetDifficulty: string = "MEDIUM",
  targetBloomsLevel?: string
): PaperOutput["sections"][number]["questions"][number] {
  const rng = mulberry32(hashSeed(`regen-${Date.now()}-${content.slice(0, 100)}`));
  const sents = sentences(content);
  const pool = sents.length > 0 ? sents : ["The system architecture provides scalable query processing over indexed document vectors."];
  const sentence = pool[Math.floor(rng() * pool.length)];

  const bloomsLevel = (targetBloomsLevel as any) ?? "APPLY";
  const diff = targetDifficulty === "EASY" || targetDifficulty === "HARD" ? targetDifficulty : "MEDIUM";
  const marks = (MARKS[targetType]?.[diff]) ?? 5;

  return {
    id: `regen-${Date.now()}`,
    question: `[Regenerated] Analyze and discuss the following statement: "${sentence}"`,
    difficulty: diff as any,
    marks,
    type: targetType as any,
    bloomsLevel: bloomsLevel as any,
    solution: `Detailed step-by-step solution for regenerated question focusing on: ${sentence.slice(0, 100)}`,
    rubric: [
      `1/3 Marks for identifying primary concepts`,
      `2/3 Marks for detailed analytical response`,
    ],
  };
}

export function demoAnswer(question: string, chunks: { content: string; page: number }[]): string {
  if (chunks.length === 0) return "The document has no indexed content to answer from.";
  const qTokens = new Set(
    question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
  );
  let best = chunks[0];
  let bestScore = -1;
  for (const chunk of chunks) {
    const cTokens = new Set(chunk.content.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const t of qTokens) if (cTokens.has(t)) overlap++;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = chunk;
    }
  }
  return `Based on the document, the most relevant passage is:\n\n“${best.content.slice(0, 600)}”\n\n(Generated by the offline demo engine — keyword-overlap retrieval, not semantic reasoning.)`;
}
