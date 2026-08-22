"use client";

import { useState } from "react";
import { api } from "../lib/api";
import type { QuestionPaper, PaperSection, QuestionItem } from "../lib/types";
import {
  Download,
  FileText,
  FileCode,
  FileSpreadsheet,
  Edit3,
  RefreshCw,
  Eye,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Save,
  X,
  Layers,
} from "lucide-react";

interface PaperStudioProps {
  paper: QuestionPaper;
  onClose?: () => void;
  onUpdate?: (updated: QuestionPaper) => void;
}

const BLOOMS_BADGES: Record<string, { label: string; color: string }> = {
  REMEMBER: { label: "Remembering", color: "bg-blue-950/60 text-blue-300 border-blue-800/50" },
  UNDERSTAND: { label: "Understanding", color: "bg-indigo-950/60 text-indigo-300 border-indigo-800/50" },
  APPLY: { label: "Applying", color: "bg-emerald-950/60 text-emerald-300 border-emerald-800/50" },
  ANALYZE: { label: "Analyzing", color: "bg-amber-950/60 text-amber-300 border-amber-800/50" },
  EVALUATE: { label: "Evaluating", color: "bg-purple-950/60 text-purple-300 border-purple-800/50" },
  CREATE: { label: "Creating", color: "bg-rose-950/60 text-rose-300 border-rose-800/50" },
};

export function PaperStudio({ paper: initialPaper, onClose, onUpdate }: PaperStudioProps) {
  const [paper, setPaper] = useState<QuestionPaper>(initialPaper);
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);

  const config = paper.config || {};
  const [institution, setInstitution] = useState(config.institution || "School of Engineering & AI");
  const [courseCode, setCourseCode] = useState(config.courseCode || "CS-301");
  const [durationMinutes, setDurationMinutes] = useState(config.durationMinutes || 180);
  const [instructions, setInstructions] = useState(
    config.instructions || "1. All questions are compulsory. 2. Figures to the right indicate full marks.",
  );

  const handleSaveHeader = async () => {
    setIsSaving(true);
    try {
      const updated = await api.updatePaper(paper.id, {
        institution,
        courseCode,
        durationMinutes,
        instructions,
      });
      setPaper(updated);
      onUpdate?.(updated);
      setIsEditingHeader(false);
    } catch (err: any) {
      alert(err.message || "Failed to update paper header");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateQuestion = async (
    sectionIdx: number,
    qIdx: number,
    updatedQuestion: Partial<QuestionItem>,
  ) => {
    setIsSaving(true);
    try {
      const newSections: PaperSection[] = JSON.parse(JSON.stringify(paper.sections || []));
      newSections[sectionIdx].questions[qIdx] = {
        ...newSections[sectionIdx].questions[qIdx],
        ...updatedQuestion,
      };

      const updated = await api.updatePaper(paper.id, { sections: newSections });
      setPaper(updated);
      onUpdate?.(updated);
      setEditingQuestionKey(null);
    } catch (err: any) {
      alert(err.message || "Failed to update question");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async (sectionIndex: number, questionIndex: number, currentQ: QuestionItem) => {
    const key = `${sectionIndex}-${questionIndex}`;
    setRegeneratingKey(key);
    try {
      const res = await api.regenerateQuestion(paper.id, {
        sectionIndex,
        questionIndex,
        type: currentQ.type,
        difficulty: currentQ.difficulty,
        bloomsLevel: currentQ.bloomsLevel,
      });
      setPaper(res.paper);
      onUpdate?.(res.paper);
    } catch (err: any) {
      alert(err.message || "Failed to regenerate question");
    } finally {
      setRegeneratingKey(null);
    }
  };

  let globalQuestionNum = 1;

  return (
    <div className="flex h-full max-w-6xl mx-auto flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card">
      {/* Top Studio Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-neutral-100">{paper.title}</h2>
              <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700">
                {paper.totalMarks} Marks
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit questions, then export Word, PDF, or Markdown.
            </p>
          </div>
        </div>

        {/* View Toggle & Export Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAnswerKey(!showAnswerKey)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              showAnswerKey
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-muted border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {showAnswerKey ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Eye className="w-4 h-4" />}
            {showAnswerKey ? "Answer key on" : "Questions only"}
          </button>

          {/* Format Downloads */}
          <a
            href={api.exportPaperUrl(paper.id, "docx", showAnswerKey)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Word (.docx)
          </a>
          <a
            href={api.exportPaperUrl(paper.id, "latex", showAnswerKey)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg transition-colors"
          >
            <FileCode className="w-3.5 h-3.5" /> LaTeX (.tex)
          </a>
          <a
            href={api.exportPaperUrl(paper.id, "md", showAnswerKey)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Markdown
          </a>
          {paper.pdfUrl && (
            <a
              href={`${api.exportPaperUrl(paper.id, "pdf")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </a>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Studio View */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Institutional Branding Header Box */}
        <div className="p-6 rounded-xl bg-neutral-950/60 border border-neutral-800 text-center relative group">
          {!isEditingHeader ? (
            <div>
              <button
                onClick={() => setIsEditingHeader(true)}
                className="absolute top-4 right-4 text-xs flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md border border-neutral-700 transition-colors"
              >
                <Edit3 className="w-3 h-3" /> Edit Header Branding
              </button>
              <h1 className="text-xl font-bold text-neutral-100 uppercase tracking-wide">
                {institution}
              </h1>
              <h2 className="text-md font-semibold text-emerald-400 mt-1">{paper.title}</h2>
              <div className="flex justify-center gap-6 text-xs font-medium text-neutral-400 mt-3 border-y border-neutral-800 py-2 my-3">
                <span>Course Code: <strong className="text-neutral-200">{courseCode}</strong></span>
                <span>Time Allowed: <strong className="text-neutral-200">{durationMinutes} Mins</strong></span>
                <span>Maximum Marks: <strong className="text-neutral-200">{paper.totalMarks}</strong></span>
              </div>
              <p className="text-xs text-neutral-400 italic text-left max-w-3xl mx-auto">
                <span className="font-semibold text-neutral-300">Instructions:</span> {instructions}
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <h3 className="text-sm font-bold text-neutral-200 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" /> Custom Institutional Header & Instructions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-neutral-400">Institution / University Name</label>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Course Code</label>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    className="w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Examination Instructions</label>
                  <input
                    type="text"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setIsEditingHeader(false)}
                  className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveHeader}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" /> Save Header
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Paper Sections & Questions */}
        {(paper.sections || []).map((sec, secIdx) => (
          <div key={secIdx} className="space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-md font-bold text-neutral-200">{sec.title}</h3>
              {sec.instruction && (
                <span className="text-xs text-neutral-400 italic">({sec.instruction})</span>
              )}
            </div>

            <div className="space-y-4">
              {sec.questions.map((q, qIdx) => {
                const qKey = `${secIdx}-${qIdx}`;
                const qNum = globalQuestionNum++;
                const isEditing = editingQuestionKey === qKey;
                const isRegenerating = regeneratingKey === qKey;
                const blooms = q.bloomsLevel ? BLOOMS_BADGES[q.bloomsLevel] : null;

                return (
                  <div
                    key={qKey}
                    className="p-5 rounded-xl bg-neutral-950/40 border border-neutral-800 hover:border-neutral-700/80 transition-all space-y-3"
                  >
                    {!isEditing ? (
                      <div>
                        {/* Question Title Bar */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="font-bold text-neutral-200 text-sm">
                                Q{qNum}.
                              </span>
                              {blooms && (
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${blooms.color}`}
                                >
                                  Bloom's: {blooms.label}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {q.type || "QUESTION"}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {q.difficulty}
                              </span>
                              <span className="text-xs font-bold text-emerald-400 ml-auto">
                                [{q.marks} Mark{q.marks > 1 ? "s" : ""}]
                              </span>
                            </div>

                            <p className="text-neutral-100 text-sm whitespace-pre-wrap font-medium">
                              {q.question}
                            </p>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setEditingQuestionKey(qKey)}
                              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-md transition-colors"
                              title="Edit question text and marks"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRegenerate(secIdx, qIdx, q)}
                              disabled={isRegenerating}
                              className="p-1.5 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-md transition-colors"
                              title="Regenerate this specific question"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin text-emerald-400" : ""}`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Options List (for MCQs) */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 pt-2 border-t border-neutral-800/60">
                            {q.options.map((opt, oi) => (
                              <div
                                key={oi}
                                className="text-xs text-neutral-300 p-2 rounded-lg bg-neutral-900/60 border border-neutral-800 flex items-center gap-2"
                              >
                                <span className="font-bold text-neutral-400">
                                  ({String.fromCharCode(65 + oi)})
                                </span>
                                <span>{opt}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Master Solution & Marking Scheme Overlay */}
                        {showAnswerKey && (
                          <div className="mt-4 space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <BookOpen className="w-3.5 h-3.5" /> Answer key
                            </div>
                            {q.answer && (
                              <p className="text-xs">
                                <strong className="text-primary">Expected: </strong> {q.answer}
                              </p>
                            )}
                            {q.solution && (
                              <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                                <strong className="text-primary">Solution: </strong> {q.solution}
                              </p>
                            )}
                            {q.rubric && q.rubric.length > 0 && (
                              <div className="pt-1 text-xs">
                                <strong className="text-primary">Marking:</strong>
                                <ul className="list-disc list-inside space-y-0.5 mt-1 text-neutral-400 pl-1">
                                  {q.rubric.map((r, ri) => (
                                    <li key={ri}>{r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Inline Question Editor */
                      <InlineQuestionEditor
                        question={q}
                        onCancel={() => setEditingQuestionKey(null)}
                        onSave={(updated) => handleUpdateQuestion(secIdx, qIdx, updated)}
                        isSaving={isSaving}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineQuestionEditor({
  question,
  onSave,
  onCancel,
  isSaving,
}: {
  question: QuestionItem;
  onSave: (updated: Partial<QuestionItem>) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [qText, setQText] = useState(question.question);
  const [marks, setMarks] = useState(question.marks);
  const [answer, setAnswer] = useState(question.answer || "");
  const [solution, setSolution] = useState(question.solution || "");

  return (
    <div className="space-y-3 p-3 bg-neutral-900 border border-neutral-700 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-emerald-400">Edit Question Details</span>
        <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div>
        <label className="text-[11px] text-neutral-400">Question Text</label>
        <textarea
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          rows={2}
          className="w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-lg p-2 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-neutral-400">Marks</label>
          <input
            type="number"
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[11px] text-neutral-400">Expected Key Answer</label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-neutral-400">Step-by-Step Solution Derivation</label>
        <textarea
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          rows={2}
          className="w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-lg p-2 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ question: qText, marks, answer, solution })}
          disabled={isSaving}
          className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md flex items-center gap-1"
        >
          <Save className="w-3 h-3" /> Save Changes
        </button>
      </div>
    </div>
  );
}
