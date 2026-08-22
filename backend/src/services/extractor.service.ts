import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../config/db";
import { isDemoMode } from "../config/env";
import { pagesDir, isR2Enabled, downloadObjectToFile, pageObjectKey } from "./storage.service";
import { TIMETABLE_SYSTEM_PROMPT, GENERIC_SYSTEM_PROMPT } from "../prompts";
import { validatedJson } from "../utils/gemini-call";
import {
  timetableSchema,
  genericExtractionSchema,
  type TimetableData,
  type GenericExtractionData,
} from "../validators/extraction.validator";
import { demoExtractTimetable, demoExtractGeneric } from "./demo-ai.service";
import { logger } from "../utils/logger";

async function firstPageImage(docId: string): Promise<string | undefined> {
  // If R2 is enabled, download the first page image from R2 to a temp file
  if (isR2Enabled()) {
    try {
      const key = pageObjectKey(docId, 1, "png");
      const path = await downloadObjectToFile(key);
      return path ?? undefined;
    } catch {
      return undefined;
    }
  }

  // Local filesystem fallback
  try {
    const files = (await readdir(pagesDir(docId))).filter((f) => f.endsWith(".png")).sort();
    return files.length ? path.join(pagesDir(docId), files[0]) : undefined;
  } catch {
    return undefined;
  }
}

export interface ExtractionOutcome {
  extractionId: string;
  demo: boolean;
  data: unknown;
}

/**
 * Run extraction and clean up temp files downloaded from R2.
 */
export async function runExtraction(docId: string, kind: "timetable" | "generic"): Promise<ExtractionOutcome> {
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
  const text = doc.ocrText ?? "";
  let image: string | undefined;
  let isTempImage = false;

  try {
    image = await firstPageImage(docId);
    isTempImage = isR2Enabled() && image !== undefined;

    let data: TimetableData | GenericExtractionData;
    let raw = "";
    let demo = isDemoMode;

    if (kind === "timetable") {
      if (!demo) {
        const result = await validatedJson(
          TIMETABLE_SYSTEM_PROMPT,
          `OCR text:\n${text.slice(0, 20_000)}`,
          timetableSchema,
          image,
        );
        data = result.data;
        raw = result.raw;
      } else {
        data = demoExtractTimetable(text);
      }
    } else {
      if (!demo) {
        const result = await validatedJson(
          GENERIC_SYSTEM_PROMPT,
          `OCR text:\n${text.slice(0, 20_000)}`,
          genericExtractionSchema,
          image,
        );
        data = result.data;
        raw = result.raw;
      } else {
        data = demoExtractGeneric(text);
      }
    }

    const extraction = await prisma.extraction.create({
      data: {
        documentId: docId,
        kind: kind === "timetable" ? "TIMETABLE" : "GENERIC",
        status: "VALIDATED",
        data: data as object,
        confidence: demo ? 0.5 : undefined,
      },
    });

    logger.info("Extraction complete", { docId, kind, demo, extractionId: extraction.id });
    return { extractionId: extraction.id, demo, data };
  } finally {
    // Clean up temp file downloaded from R2
    if (isTempImage && image) {
      try { await rm(image, { force: true }); } catch { /* ignore */ }
    }
  }
}
