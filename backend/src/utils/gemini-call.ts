import { ai, models } from "../config/gemini";
import { isDemoMode } from "../config/env";
import { extractJson } from "./json-extract";
import { AppError } from "../middleware/error";
import type { Part } from "@google/genai";
import type { ZodType } from "zod";

export interface GeminiJsonResult {
  raw: string;
  json: unknown;
}

/** Call Gemini with a system prompt, optional page image, JSON output enforced. */
export async function callGeminiJson(
  system: string,
  userText: string,
  imagePath?: string,
): Promise<GeminiJsonResult> {
  if (!ai || isDemoMode) {
    throw new AppError(500, "AI provider not configured (demo mode)");
  }
  const parts: Part[] = [{ text: userText }];
  if (imagePath) {
    const buf = await Bun.file(imagePath).arrayBuffer();
    parts.unshift({
      inlineData: { mimeType: "image/png", data: Buffer.from(buf).toString("base64") },
    });
  }
  const res = await ai.models.generateContent({
    model: models.generate,
    contents: [{ role: "user", parts }],
    config: { systemInstruction: system, responseMimeType: "application/json" },
  });
  const raw = res.text ?? "";
  return { raw, json: extractJson(raw) };
}

function zodSummary(error: import("zod").ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join(" | ");
}

/**
 * Validation isn't a wall, it's a loop: if the model's JSON fails the
 * schema, we re-prompt once with the validation error as corrective
 * context. Two attempts convert the majority of failures.
 */
export async function validatedJson<T>(
  system: string,
  userText: string,
  schema: ZodType<T>,
  imagePath?: string,
): Promise<{ data: T; raw: string }> {
  const first = await callGeminiJson(system, userText, imagePath);
  const parsed = schema.safeParse(first.json);
  if (parsed.success) return { data: parsed.data, raw: first.raw };

  const feedback = `Your previous output was invalid JSON against the schema. Errors:\n${zodSummary(parsed.error)}\nReturn corrected JSON only.`;
  const second = await callGeminiJson(system, `${userText}\n\n${feedback}`, imagePath);
  const secondParsed = schema.safeParse(second.json);
  if (secondParsed.success) return { data: secondParsed.data, raw: second.raw };

  throw new AppError(422, `AI output failed validation after corrective retry: ${zodSummary(secondParsed.error)}`);
}
