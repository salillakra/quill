import { describe, expect, test } from "bun:test";
import { generateDocxBuffer } from "../src/services/docx-exporter.service";
import { generateLatexString } from "../src/services/latex-exporter.service";
import { analyzeTimetable } from "../src/services/timetable-analytics.service";
import { demoGeneratePaper, demoRegenerateQuestion } from "../src/services/demo-ai.service";
import { paperConfigSchema, paperOutputSchema } from "../src/validators/paper.validator";

describe("DOCX Exporter", () => {
  test("generates valid docx binary buffer with headers and questions", async () => {
    const paper = {
      title: "Mid-Term Examination 2026",
      totalMarks: 50,
      config: {
        institution: "Department of Computer Science",
        courseCode: "CS-401",
        durationMinutes: 180,
        instructions: "Attempt all questions.",
      },
      sections: [
        {
          title: "Section A — Objective",
          instruction: "Answer all",
          questions: [
            {
              id: "q1",
              question: "What is vector search?",
              difficulty: "EASY" as const,
              marks: 2,
              type: "SHORT_ANSWER" as const,
              bloomsLevel: "REMEMBER" as const,
              answer: "Similarity search over embedding vectors",
              solution: "Vectors compare angle or distance.",
              rubric: ["1 Mark definition", "1 Mark example"],
            },
          ],
        },
      ],
    };

    const buffer = await generateDocxBuffer(paper, true);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
  });
});

describe("LaTeX Exporter", () => {
  test("generates compilable TeX source with document header and answer key", () => {
    const paper = {
      title: "Algorithms Final Exam",
      totalMarks: 100,
      config: {
        institution: "IIT Bombay",
        courseCode: "CS-201",
        durationMinutes: 180,
      },
      sections: [
        {
          title: "Section A",
          questions: [
            {
              id: "q1",
              question: "State Big-O complexity of quicksort.",
              difficulty: "MEDIUM" as const,
              marks: 5,
              type: "SHORT_ANSWER" as const,
              bloomsLevel: "UNDERSTAND" as const,
              answer: "O(n log n) average case",
              solution: "Recurrence relation T(n) = 2T(n/2) + O(n)",
              rubric: ["2 Marks recurrence", "3 Marks solution"],
            },
          ],
        },
      ],
    };

    const tex = generateLatexString(paper, true);
    expect(tex).toContain("\\documentclass[11pt,a4paper]{article}");
    expect(tex).toContain("State Big-O complexity of quicksort");
    expect(tex).toContain("MASTER ANSWER KEY");
    expect(tex).toContain("\\end{document}");
  });
});

describe("Timetable Analytics Engine (AnugatAI Killer)", () => {
  test("detects room conflicts when two lectures occupy the same room and day/period", () => {
    const slots = [
      { day: 0, period: 1, course: "Data Structures", code: "CS201", room: "R101", faculty: "Dr. Smith" },
      { day: 0, period: 1, course: "Database Systems", code: "CS301", room: "R101", faculty: "Prof. Jones" },
    ];

    const result = analyzeTimetable(slots);
    expect(result.clashes.length).toBeGreaterThan(0);
    const roomClash = result.clashes.find((c) => c.type === "ROOM_CLASH");
    expect(roomClash).toBeDefined();
    expect(roomClash?.locationOrPerson).toContain("Room R101");
    expect(roomClash?.conflictingCourses).toContain("Data Structures");
    expect(roomClash?.conflictingCourses).toContain("Database Systems");
  });

  test("calculates room utilization rates and faculty workload", () => {
    const slots = [
      { day: 0, period: 1, course: "Algorithms", code: "CS302", room: "R102", faculty: "Dr. Smith" },
      { day: 0, period: 2, course: "Algorithms Lab", code: "CS302L", room: "R102", faculty: "Dr. Smith" },
      { day: 1, period: 1, course: "OS", code: "CS303", room: "R103", faculty: "Dr. Smith" },
    ];

    const result = analyzeTimetable(slots);
    expect(result.uniqueRoomsCount).toBe(2);
    expect(result.uniqueFacultyCount).toBe(1);
    expect(result.roomUtilizations[0].room).toBe("R102");
    expect(result.roomUtilizations[0].occupiedSlots).toBe(2);
    expect(result.facultyWorkloads[0].faculty).toBe("Dr. Smith");
    expect(result.facultyWorkloads[0].totalSlots).toBe(3);
  });
});

describe("Paper Generation & Question Regeneration (VedaAI Killer)", () => {
  test("generates papers with Bloom's taxonomy tags and solutions", () => {
    const config = paperConfigSchema.parse({
      title: "AI Systems Test",
      questionTypes: ["MCQ", "SHORT_ANSWER", "NUMERICAL", "DIAGRAM", "CASE_STUDY"],
      numberOfQuestions: 5,
      totalMarks: 30,
      difficulty: "MEDIUM",
      institution: "MIT AI Lab",
      courseCode: "AI-501",
    });

    const output = demoGeneratePaper("Deep learning models utilize neural networks for pattern recognition.", config);

    expect(output.sections.length).toBeGreaterThan(0);
    const allQuestions = output.sections.flatMap((s) => s.questions);
    expect(allQuestions.length).toBe(5);

    const first = allQuestions[0];
    expect(first.bloomsLevel).toBeDefined();
    expect(first.solution).toBeDefined();
    expect(first.rubric).toBeDefined();
  });

  test("regenerates a single question with targeted difficulty and Bloom's level", () => {
    const regen = demoRegenerateQuestion("Neural network optimization using SGD", "CASE_STUDY", "HARD", "EVALUATE");
    expect(regen.type).toBe("CASE_STUDY");
    expect(regen.difficulty).toBe("HARD");
    expect(regen.bloomsLevel).toBe("EVALUATE");
    expect(regen.solution).toBeDefined();
  });
});
