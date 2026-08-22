"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { EmptyState, statusBadge } from "@/components/status";
import { useJobsSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GradeOverrideDialog } from "@/components/grade-override";
import { ContextualAskDialog } from "@/components/contextual-ask";
import { FormSelect } from "@/components/form-select";
import type { Assignment, Student, Submission } from "@/lib/types";

type AssignmentDetailData = Assignment & { submissions: Submission[] };

export function AssignmentDetail({
  id,
  initialAssignment,
  initialStudents,
  canMutate,
}: {
  id: string;
  initialAssignment: AssignmentDetailData;
  initialStudents: Student[];
  canMutate: boolean;
}) {
  const qc = useQueryClient();
  useJobsSocket([["assessment-assignment", id], ["assessment-grading"]]);
  const { data } = useQuery({
    queryKey: ["assessment-assignment", id],
    queryFn: () => api.getAssignment(id),
    initialData: initialAssignment,
    staleTime: 10_000,
  });
  const students = useQuery({
    queryKey: ["assessment-students"],
    queryFn: api.listStudents,
    initialData: initialStudents,
    staleTime: 10_000,
  });
  const [studentId, setStudentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState("A");
  const [newRoll, setNewRoll] = useState("");
  const [override, setOverride] = useState<Submission | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const current = data ?? initialAssignment;
  const rubric = current.rubric ?? [];

  const addStudent = useMutation({
    mutationFn: () => api.createStudent({ name: newName, section: newSection, rollNo: newRoll }),
    onSuccess: (row) => {
      toast.success("Student added");
      setStudentId(row.id);
      setNewName("");
      setNewRoll("");
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add student"),
  });

  const upload = useMutation({
    mutationFn: () => {
      if (!file || !studentId) throw new Error("Pick a student and a file");
      return api.uploadSubmission(id, studentId, file);
    },
    onSuccess: () => {
      toast.success("Script uploaded — we’ll prepare it, then start grading");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["assessment-assignment", id] });
      qc.invalidateQueries({ queryKey: ["assessment-grading"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.questionPaper?.title ?? "No linked paper"}
          {current.dueAt ? ` · due ${new Date(current.dueAt).toLocaleString()}` : ""}
          {" · "}
          <Link href="/assessment/grading" className="text-primary hover:underline">
            Grading queue
          </Link>
          {" · "}
          <Link href="/assessment/students" className="text-primary hover:underline">
            Students roster
          </Link>
          {current.questionPaper?.documentId ? (
            <>
              {" · "}
              <button type="button" className="text-primary hover:underline" onClick={() => setAskOpen(true)}>
                Ask source document
              </button>
            </>
          ) : null}
        </p>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Rubric</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          {rubric.map((r) => (
            <span key={r.id} className="rounded-md border border-border px-2 py-1">
              {r.criterion} · {r.maxMarks}
            </span>
          ))}
        </CardContent>
      </Card>

      {canMutate ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload answer script</CardTitle>
            <CardDescription>Upload on behalf of the student. We’ll read the script, then grade it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Student</Label>
                <FormSelect
                  value={studentId}
                  onValueChange={setStudentId}
                  placeholder="Select"
                  options={(students.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.rollNo} · ${s.name} (${s.section})`,
                  }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="script">File</Label>
                <Input
                  id="script"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Button onClick={() => upload.mutate()} disabled={upload.isPending || !studentId || !file}>
              Upload & grade
            </Button>
            <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Add student · or manage the{" "}
                <Link href="/assessment/students" className="text-primary hover:underline">
                  full roster
                </Link>
              </p>
              <div className="grid gap-2 sm:grid-cols-4">
                <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input placeholder="Section" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
                <Input placeholder="Roll no" value={newRoll} onChange={(e) => setNewRoll(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => addStudent.mutate()} disabled={!newName || !newRoll}>
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Submissions</h2>
        {!current.submissions?.length ? (
          <EmptyState title="No scripts yet" description="Upload a PDF or image of a handwritten or typed answer." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.submissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    {sub.student?.name} · {sub.student?.rollNo}
                  </TableCell>
                  <TableCell>{statusBadge(sub.status)}</TableCell>
                  <TableCell>{sub.grade ? sub.grade.total : "—"}</TableCell>
                  <TableCell className="text-right">
                    {canMutate && sub.grade ? (
                      <Button size="sm" variant="outline" onClick={() => setOverride(sub)}>
                        Override
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <GradeOverrideDialog submission={override} open={!!override} onOpenChange={(o) => !o && setOverride(null)} />
      <ContextualAskDialog
        docId={current.questionPaper?.documentId ?? null}
        title={current.questionPaper?.title ?? current.title}
        open={askOpen}
        onOpenChange={setAskOpen}
      />
    </div>
  );
}
