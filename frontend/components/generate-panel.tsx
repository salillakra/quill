"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileOutput, Loader2, ArrowRight } from "lucide-react";
import { api, pdfUrl } from "@/lib/api";
import type { QuestionPaper } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FormSelect } from "@/components/form-select";
import { PaperStudio } from "@/components/paper-studio";
import { statusBadge } from "@/components/status";
import Link from "next/link";

const QUESTION_TYPES = [
  { id: "MCQ", label: "Multiple choice" },
  { id: "SHORT_ANSWER", label: "Short answer" },
  { id: "LONG_ANSWER", label: "Long answer" },
  { id: "NUMERICAL", label: "Numerical" },
  { id: "DIAGRAM", label: "Diagram" },
  { id: "TRUE_FALSE", label: "True / false" },
  { id: "FILL_BLANK", label: "Fill in the blank" },
  { id: "CASE_STUDY", label: "Case study" },
] as const;

const DIFFICULTIES = [
  { id: "EASY", label: "Easy" },
  { id: "MEDIUM", label: "Medium" },
  { id: "HARD", label: "Hard" },
] as const;

const BLOOMS_LEVELS = [
  { id: "REMEMBER", label: "Remember" },
  { id: "UNDERSTAND", label: "Understand" },
  { id: "APPLY", label: "Apply" },
  { id: "ANALYZE", label: "Analyze" },
  { id: "EVALUATE", label: "Evaluate" },
  { id: "CREATE", label: "Create" },
] as const;

export function GeneratePanel({
  docId,
  canGenerate,
  initialPapers,
}: {
  docId: string;
  canGenerate: boolean;
  initialPapers?: QuestionPaper[];
}) {
  const queryClient = useQueryClient();
  const [studio, setStudio] = useState<QuestionPaper | null>(null);
  const [title, setTitle] = useState("");
  const [types, setTypes] = useState<string[]>(["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "NUMERICAL"]);
  const [count, setCount] = useState(10);
  const [marks, setMarks] = useState(50);
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [bloomsLevel, setBloomsLevel] = useState("APPLY");
  const [institution, setInstitution] = useState("School of Engineering & AI");
  const [courseCode, setCourseCode] = useState("CS-301");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: papers } = useQuery({
    queryKey: ["papers", docId],
    queryFn: () => api.getPapers(docId),
    enabled: docId !== "",
    initialData: initialPapers,
    staleTime: 10_000,
  });

  function toggleType(t: string) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (types.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.generatePaper(docId, {
        title: title.trim() || `${new Date().toLocaleDateString()} Examination Paper`,
        questionTypes: types,
        numberOfQuestions: count,
        totalMarks: marks,
        difficulty,
        targetBloomsLevel: bloomsLevel,
        institution,
        courseCode,
      });
      queryClient.invalidateQueries({ queryKey: ["papers", docId] });
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t create the paper");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="paper-title">Paper title</Label>
          <Input
            id="paper-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mid-semester — Algorithms"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="institution">Institution</Label>
            <Input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="course-code">Course code</Label>
            <Input id="course-code" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="mb-1.5">Question types</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  types.includes(t.id)
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="q-count">Questions</Label>
            <Input
              id="q-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q-marks">Total marks</Label>
            <Input
              id="q-marks"
              type="number"
              min={1}
              max={500}
              value={marks}
              onChange={(e) => setMarks(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="q-diff">Difficulty</Label>
            <FormSelect
              id="q-diff"
              value={difficulty}
              onValueChange={setDifficulty}
              options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
            />
          </div>
        </div>

        <div>
          <Label className="mb-1.5">Focus</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {BLOOMS_LEVELS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBloomsLevel(b.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  bloomsLevel === b.id
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
        ) : null}

        <Button type="submit" disabled={submitting || !canGenerate || types.length === 0}>
          {submitting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileOutput data-icon="inline-start" />}
          {submitting ? "Creating paper…" : "Create question paper"}
        </Button>
        {!canGenerate ? (
          <p className="text-[11px] text-muted-foreground">Wait until the document is ready, then you can create a paper.</p>
        ) : null}
      </form>

      {papers && papers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Papers from this document</p>
          {papers.map((p: QuestionPaper) => (
            <Card key={p.id} size="sm">
              <CardContent className="flex items-center gap-3 pt-4">
                <FileOutput className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.totalMarks} marks · {timeAgo(p.createdAt)}
                  </div>
                </div>
                {statusBadge(p.status)}

                {p.status === "COMPLETED" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStudio(p)}>
                      Open studio
                    </Button>
                    {p.pdfUrl ? (
                      <Button size="sm" variant="outline" render={<a href={pdfUrl(p)} target="_blank" rel="noreferrer" />}>
                        <Download data-icon="inline-start" /> PDF
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" render={<Link href={`/assessment/assignments?paper=${p.id}`} />}>
                      Create assignment <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {studio ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[92vh] w-full flex-col">
            <PaperStudio
              paper={studio}
              onClose={() => {
                setStudio(null);
                queryClient.invalidateQueries({ queryKey: ["papers", docId] });
              }}
              onUpdate={(updated) => setStudio(updated)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
