import { describe, expect, test } from "bun:test";
import { timetableSchema, extractRequestSchema, DAY_NAME_TO_INDEX } from "../src/validators/extraction.validator";
import { paperConfigSchema, paperOutputSchema } from "../src/validators/paper.validator";
import { loginSchema, passwordChangeSchema, workspaceCreateSchema, workspaceSwitchSchema } from "../src/validators/auth.validator";
import { studentPatch, parentLinkInput } from "../src/validators/assessment.validator";

describe("timetableSchema", () => {
  test("accepts a valid timetable", () => {
    const result = timetableSchema.safeParse({
      branch: "CSE",
      semester: 3,
      section: "A",
      rows: [
        { day: "Monday", period: 1, course: "Data Structures", code: "CS303", room: "L1", faculty: "Meera Nair" },
        { day: 2, period: 5, course: "Networks" },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty rows", () => {
    const result = timetableSchema.safeParse({ branch: "CSE", semester: 3, rows: [] });
    expect(result.success).toBe(false);
  });

  test("rejects unknown day names", () => {
    const result = timetableSchema.safeParse({
      branch: "CSE",
      semester: 3,
      rows: [{ day: "Funday", period: 1, course: "X" }],
    });
    expect(result.success).toBe(false);
  });

  test("day name mapping is complete for Mon–Fri", () => {
    expect(DAY_NAME_TO_INDEX).toMatchObject({ monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 });
  });
});

describe("extractRequestSchema", () => {
  test("only timetable | generic", () => {
    expect(extractRequestSchema.safeParse({ kind: "timetable" }).success).toBe(true);
    expect(extractRequestSchema.safeParse({ kind: "generic" }).success).toBe(true);
    expect(extractRequestSchema.safeParse({ kind: "banana" }).success).toBe(false);
  });
});

describe("paperConfigSchema", () => {
  test("accepts valid config", () => {
    const result = paperConfigSchema.safeParse({
      title: "Midterm",
      questionTypes: ["MCQ", "SHORT_ANSWER"],
      numberOfQuestions: 10,
      totalMarks: 50,
      difficulty: "MEDIUM",
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown question types and absurd counts", () => {
    expect(paperConfigSchema.safeParse({ title: "X", questionTypes: ["ESSAY"], numberOfQuestions: 3, totalMarks: 10 }).success).toBe(false);
    expect(paperConfigSchema.safeParse({ title: "X", questionTypes: ["MCQ"], numberOfQuestions: 999, totalMarks: 10 }).success).toBe(false);
  });
});

describe("paperOutputSchema", () => {
  test("accepts generated sections", () => {
    const result = paperOutputSchema.safeParse({
      sections: [
        {
          title: "Section A",
          instruction: "All questions carry 2 marks",
          questions: [
            { question: "What is DSP?", difficulty: "EASY", marks: 2, type: "SHORT_ANSWER", answer: "..." },
            { question: "Pick one", difficulty: "MEDIUM", marks: 2, type: "MCQ", options: ["a", "b", "c", "d"], answer: "a" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty sections", () => {
    expect(paperOutputSchema.safeParse({ sections: [] }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  test("requires email + password >= 6 chars", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "secret1" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "secret1" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "123" }).success).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  test("requires current + new password >= 6 chars", () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: "secret1", newPassword: "secret2" }).success,
    ).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: "123", newPassword: "secret2" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: "secret1", newPassword: "123" }).success).toBe(false);
  });
});

describe("workspaceCreateSchema", () => {
  test("accepts lowercase slug", () => {
    expect(workspaceCreateSchema.safeParse({ name: "Acme", slug: "acme-1" }).success).toBe(true);
  });
  test("rejects empty name and invalid slug", () => {
    expect(workspaceCreateSchema.safeParse({ name: "", slug: "acme" }).success).toBe(false);
    expect(workspaceCreateSchema.safeParse({ name: "Acme", slug: "Acme" }).success).toBe(false);
  });
});

describe("workspaceSwitchSchema", () => {
  test("requires workspaceId", () => {
    expect(workspaceSwitchSchema.safeParse({ workspaceId: "ws_1" }).success).toBe(true);
    expect(workspaceSwitchSchema.safeParse({ workspaceId: "" }).success).toBe(false);
  });
});

describe("studentPatch", () => {
  test("accepts partial roster fields and nullable userId", () => {
    expect(studentPatch.safeParse({ userId: null }).success).toBe(true);
    expect(studentPatch.safeParse({ name: "Asha", section: "B", rollNo: "12" }).success).toBe(true);
    expect(studentPatch.safeParse({}).success).toBe(true);
  });
  test("rejects empty strings when provided", () => {
    expect(studentPatch.safeParse({ name: "" }).success).toBe(false);
    expect(studentPatch.safeParse({ rollNo: "" }).success).toBe(false);
  });
});

describe("parentLinkInput", () => {
  test("requires parentUserId", () => {
    expect(parentLinkInput.safeParse({ parentUserId: "usr_1" }).success).toBe(true);
    expect(parentLinkInput.safeParse({ parentUserId: "" }).success).toBe(false);
    expect(parentLinkInput.safeParse({}).success).toBe(false);
  });
});
