"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { GradeRecord, Submission } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function GradeOverrideDialog({
  submission,
  open,
  onOpenChange,
}: {
  submission: Submission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const grade = submission?.grade;
  const [scores, setScores] = useState<GradeRecord["finalScores"]>([]);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (open && submission?.grade) {
      setScores(submission.grade.finalScores);
      setFeedback(submission.grade.feedback ?? "");
    }
  }, [open, submission?.id]);

  const save = useMutation({
    mutationFn: () => {
      if (!grade) throw new Error("No grade");
      return api.overrideGrade(grade.id, { finalScores: scores, feedback });
    },
    onSuccess: () => {
      toast.success("Override saved · marked reviewed");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["assessment-grading"] });
      qc.invalidateQueries({ queryKey: ["assessment-assignment"] });
      qc.invalidateQueries({ queryKey: ["assessment-analytics"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Override failed"),
  });

  if (!submission || !grade) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Override · {submission.student?.name ?? "Student"} · {submission.assignment?.title ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {scores.map((item, i) => (
            <div key={item.id} className="grid grid-cols-[1fr_5rem] items-end gap-2">
              <div className="grid gap-1">
                <Label>
                  {item.criterion} <span className="text-muted-foreground">/ {item.maxMarks}</span>
                </Label>
                {item.comment && <p className="text-xs text-muted-foreground">{item.comment}</p>}
              </div>
              <Input
                type="number"
                min={0}
                max={item.maxMarks}
                step={0.5}
                value={item.score}
                onChange={(e) => {
                  const next = [...scores];
                  next[i] = { ...item, score: Number(e.target.value) };
                  setScores(next);
                }}
              />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="grade-feedback">Feedback</Label>
            <Textarea id="grade-feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
