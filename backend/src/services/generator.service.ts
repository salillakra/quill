import { prisma } from "../config/db";
import { isDemoMode } from "../config/env";
import { buildPaperSystemPrompt, buildPaperUserPrompt } from "../prompts";
import { validatedJson } from "../utils/gemini-call";
import { paperOutputSchema, type PaperConfig, type PaperOutput } from "../validators/paper.validator";
import { demoGeneratePaper } from "./demo-ai.service";
import { logger } from "../utils/logger";

export async function generatePaperSections(
  content: string,
  config: PaperConfig,
): Promise<{ sections: PaperOutput["sections"]; demo: boolean }> {
  if (!isDemoMode) {
    const { data } = await validatedJson(
      buildPaperSystemPrompt(config),
      buildPaperUserPrompt(content),
      paperOutputSchema,
    );
    return { sections: data.sections, demo: false };
  }
  return { sections: demoGeneratePaper(content, config).sections, demo: true };
}

export async function createPaper(docId: string, config: PaperConfig) {
  return prisma.questionPaper.create({
    data: {
      title: config.title,
      status: "PENDING",
      totalMarks: config.totalMarks,
      config: config as object,
      sections: [] as unknown as object, // populated by the generate worker
      documentId: docId,
    },
  });
}

export async function savePaperSections(paperId: string, sections: PaperOutput["sections"]) {
  const paper = await prisma.questionPaper.update({
    where: { id: paperId },
    data: { sections: sections as unknown as object, status: "PROCESSING" },
  });
  logger.info("Paper sections saved", { paperId, sections: sections.length, demo: isDemoMode });
  return paper;
}
