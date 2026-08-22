import type { PaperConfig, PaperOutput } from "../validators/paper.validator";

export function generateLatexString(
  paper: {
    title: string;
    totalMarks: number;
    config: any;
    sections: any;
  },
  includeAnswerKey: boolean = true,
): string {
  const config: PaperConfig = paper.config || {};
  const sections: PaperOutput["sections"] = paper.sections || [];

  const institution = config.institution || "School of Computer Science & Engineering";
  const courseCode = config.courseCode || "CS-301";
  const duration = config.durationMinutes ? `${config.durationMinutes} Minutes` : "3 Hours";
  const instructions = config.instructions || "1. All questions are compulsory. 2. Figures to the right indicate full marks.";

  const escapeLatex = (str: string = ""): string => {
    return str
      .replace(/\\/g, "\\textbackslash ")
      .replace(/&/g, "\\&")
      .replace(/%/g, "\\%")
      .replace(/\$/g, "\\$")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\textasciitilde ")
      .replace(/\^/g, "\\textasciicircum ");
  };

  const lines: string[] = [
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[utf8]{utf8}",
    "\\usepackage[margin=1in]{geometry}",
    "\\usepackage{amsmath,amssymb,amsfonts}",
    "\\usepackage{enumitem}",
    "\\usepackage{fancyhdr}",
    "\\usepackage{xcolor}",
    "\\usepackage{titlesec}",
    "",
    "\\pagestyle{fancy}",
    "\\fancyhf{}",
    `\\rhead{Max Marks: ${paper.totalMarks}}`,
    `\\lhead{Course: ${escapeLatex(courseCode)}}`,
    "\\cfoot{\\thepage}",
    "",
    "\\begin{document}",
    "",
    "% --- Header Box ---",
    "\\begin{center}",
    `    {\\LARGE \\bfseries ${escapeLatex(institution.toUpperCase())}} \\\\[6pt]`,
    `    {\\Large \\bfseries ${escapeLatex(paper.title)}} \\\\[8pt]`,
    "\\end{center}",
    "",
    "\\noindent \\textbf{Course Code:} " + escapeLatex(courseCode) + " \\hfill \\textbf{Duration:} " + escapeLatex(duration) + " \\hfill \\textbf{Total Marks:} " + paper.totalMarks + " \\\\",
    "\\rule{\\linewidth}{0.8pt}",
    "",
    "\\vspace{6pt}",
    "\\noindent \\textbf{Instructions:}",
    "\\begin{enumerate}[leftmargin=*]",
    `    \\item ${escapeLatex(instructions)}`,
    "\\end{enumerate}",
    "\\vspace{10pt}",
    "",
  ];

  let globalQNum = 1;

  for (const section of sections) {
    lines.push(`\\section*{${escapeLatex(section.title)}}`);
    if (section.instruction) {
      lines.push(`\\noindent {\\itshape ${escapeLatex(section.instruction)}}\\\\`);
    }
    lines.push("\\begin{enumerate}[label=\\bfseries Q\\arabic*., leftmargin=*]");

    for (const q of section.questions) {
      const bloomsText = q.bloomsLevel ? ` \\textcolor{gray}{[Bloom's: ${q.bloomsLevel}]}` : "";
      const marksText = ` \\hfill \\textbf{[${q.marks} Mark${q.marks > 1 ? "s" : ""}]}`;

      lines.push(`\\item ${escapeLatex(q.question)}${marksText}${bloomsText}`);

      if (q.options && q.options.length > 0) {
        lines.push("  \\begin{enumerate}[label=(\\Alph*)]");
        for (const opt of q.options) {
          lines.push(`    \\item ${escapeLatex(opt)}`);
        }
        lines.push("  \\end{enumerate}");
      }
      globalQNum++;
    }
    lines.push("\\end{enumerate}");
    lines.push("\\vspace{12pt}");
  }

  if (includeAnswerKey) {
    lines.push("\\newpage");
    lines.push("\\begin{center}");
    lines.push("    {\\Large \\bfseries \\color{blue!80!black} MASTER ANSWER KEY \\& STEP-BY-STEP MARKING SCHEME}");
    lines.push("\\end{center}");
    lines.push("\\rule{\\linewidth}{1pt}");
    lines.push("\\vspace{12pt}");

    let solQNum = 1;
    for (const section of sections) {
      for (const q of section.questions) {
        lines.push(`\\subsection*{Q${solQNum} Solution (${q.type || "Question"} - ${q.marks} Marks)}`);
        if (q.answer) {
          lines.push(`\\noindent \\textbf{Key Answer:} ${escapeLatex(q.answer)}\\\\`);
        }
        if (q.solution) {
          lines.push(`\\noindent \\textbf{Detailed Derivation:} ${escapeLatex(q.solution)}\\\\`);
        }
        if (q.rubric && q.rubric.length > 0) {
          lines.push("\\noindent \\textbf{Marking Scheme Breakdown:}");
          lines.push("\\begin{itemize}[leftmargin=*]");
          for (const item of q.rubric) {
            lines.push(`  \\item ${escapeLatex(item)}`);
          }
          lines.push("\\end{itemize}");
        }
        lines.push("\\vspace{8pt}");
        solQNum++;
      }
    }
  }

  lines.push("\\end{document}");

  return lines.join("\n");
}
