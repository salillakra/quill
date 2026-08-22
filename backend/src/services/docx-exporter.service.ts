import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { PaperConfig, PaperOutput } from "../validators/paper.validator";

export async function generateDocxBuffer(
  paper: {
    title: string;
    totalMarks: number;
    config: any;
    sections: any;
  },
  includeAnswerKey: boolean = true,
): Promise<Buffer> {
  const config: PaperConfig = paper.config || {};
  const sections: PaperOutput["sections"] = paper.sections || [];

  const institution = config.institution || "School of Computer Science & Engineering";
  const courseCode = config.courseCode || "CS-301";
  const duration = config.durationMinutes ? `${config.durationMinutes} Minutes` : "3 Hours";
  const instructions = config.instructions || "1. All questions are compulsory. 2. Figures to the right indicate full marks.";

  const docChildren: any[] = [];

  // Header Title
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: institution.toUpperCase(),
          bold: true,
          size: 28,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: paper.title,
          bold: true,
          size: 24,
          font: "Calibri",
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  // Meta Table
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `Course Code: ${courseCode}`, bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `Duration: ${duration}`, bold: true })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `Max Marks: ${paper.totalMarks}`, bold: true })] })],
          }),
        ],
      }),
    ],
  });
  docChildren.push(metaTable, new Paragraph({ text: "", spacing: { after: 200 } }));

  // Instructions Paragraph
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Instructions:", bold: true, underline: {} }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: instructions, italics: true })],
      spacing: { after: 300 },
    }),
  );

  let globalQNum = 1;

  // Sections & Questions
  for (const section of sections) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.title, bold: true, size: 22 })],
        spacing: { before: 300, after: 100 },
      }),
    );
    if (section.instruction) {
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: section.instruction, italics: true })],
          spacing: { after: 150 },
        }),
      );
    }

    for (const q of section.questions) {
      const bloomsText = q.bloomsLevel ? ` [Bloom's: ${q.bloomsLevel}]` : "";
      const diffText = q.difficulty ? ` (${q.difficulty})` : "";
      const marksText = ` [${q.marks} Mark${q.marks > 1 ? "s" : ""}]`;

      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Q${globalQNum}. `, bold: true }),
            new TextRun({ text: q.question }),
            new TextRun({ text: `${marksText}${bloomsText}${diffText}`, bold: true, color: "555555" }),
          ],
          spacing: { before: 150, after: q.options?.length ? 80 : 150 },
        }),
      );

      if (q.options && q.options.length > 0) {
        const optionLabels = ["A", "B", "C", "D", "E", "F"];
        for (let oi = 0; oi < q.options.length; oi++) {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: `    (${optionLabels[oi] || oi + 1}) `, bold: true }),
                new TextRun({ text: q.options[oi] }),
              ],
              spacing: { after: 60 },
            }),
          );
        }
      }

      globalQNum++;
    }
  }

  // Answer Key & Solution Scheme Section (if requested)
  if (includeAnswerKey) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MASTER ANSWER KEY & STEP-BY-STEP MARKING SCHEME", bold: true, color: "1E3A8A" })],
        spacing: { before: 600, after: 200 },
      }),
    );

    let solQNum = 1;
    for (const section of sections) {
      for (const q of section.questions) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Solution Q${solQNum} (${q.type || "QUESTION"} - ${q.marks} Marks):`, bold: true, color: "1E40AF" }),
            ],
            spacing: { before: 180, after: 80 },
          }),
        );

        if (q.answer) {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Answer/Key: ", bold: true }),
                new TextRun({ text: q.answer }),
              ],
              spacing: { after: 60 },
            }),
          );
        }

        if (q.solution) {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Detailed Solution: ", bold: true }),
                new TextRun({ text: q.solution }),
              ],
              spacing: { after: 60 },
            }),
          );
        }

        if (q.rubric && q.rubric.length > 0) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: "Marking Scheme / Rubric:", bold: true })],
              spacing: { after: 40 },
            }),
          );
          for (const item of q.rubric) {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `  • `, bold: true }),
                  new TextRun({ text: item }),
                ],
                spacing: { after: 40 },
              }),
            );
          }
        }

        solQNum++;
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

