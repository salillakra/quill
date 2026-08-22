"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormSelect } from "@/components/form-select";
import { timeAgo } from "@/lib/utils";
import type { Assignment, QuestionPaper, RubricItem } from "@/lib/types";

const DEFAULT_RUBRIC: RubricItem[] = [
  { id: "correctness", criterion: "Correctness", maxMarks: 10 },
  { id: "completeness", criterion: "Completeness", maxMarks: 5 },
  { id: "clarity", criterion: "Clarity", maxMarks: 5 },
];

type PaperRow = QuestionPaper & { document?: { id: string; title: string } };

export function AssignmentsList({
  initialAssignments,
  initialPapers,
  canMutate,
  paperFromQuery,
}: {
  initialAssignments: Assignment[];
  initialPapers: PaperRow[];
  canMutate: boolean;
  paperFromQuery: string;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["assessment-assignments"],
    queryFn: api.listAssignments,
    initialData: initialAssignments,
    staleTime: 10_000,
  });
  const papers = useQuery({
    queryKey: ["papers"],
    queryFn: api.listPapers,
    initialData: initialPapers,
    staleTime: 10_000,
  });
  const [open, setOpen] = useState(Boolean(paperFromQuery));
  const [title, setTitle] = useState("");
  const [paperId, setPaperId] = useState(paperFromQuery);
  const [dueAt, setDueAt] = useState("");
  const [rubric, setRubric] = useState<RubricItem[]>(DEFAULT_RUBRIC);
  const list = data ?? initialAssignments;

  useEffect(() => {
    if (!paperFromQuery) return;
    setPaperId(paperFromQuery);
    setOpen(true);
  }, [paperFromQuery]);

  const create = useMutation({
    mutationFn: () =>
      api.createAssignment({
        title,
        rubric,
        questionPaperId: paperId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success("Assignment created");
      setOpen(false);
      setTitle("");
      setPaperId("");
      setDueAt("");
      setRubric(DEFAULT_RUBRIC);
      qc.invalidateQueries({ queryKey: ["assessment-assignments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Roster for submissions. Link student logins on the Students page.
          </p>
        </div>
        {canMutate ? <Button onClick={() => setOpen(true)}>New assignment</Button> : null}
      </div>

      {!list.length ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="No assignments"
          description="Create one, optionally linked to a generated question paper."
          action={
            <Button variant="outline" render={<Link href="/papers" />}>
              Open papers
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/assessment/assignments/${row.id}`} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.questionPaper?.title ?? "—"}</TableCell>
                <TableCell>{row._count?.submissions ?? 0}</TableCell>
                <TableCell className="text-muted-foreground">{timeAgo(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New assignment</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="asg-title">Title</Label>
              <Input id="asg-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Question paper</Label>
              <FormSelect
                value={paperId}
                onValueChange={setPaperId}
                options={[
                  { value: "", label: "None" },
                  ...(papers.data ?? [])
                    .filter((p) => p.status === "COMPLETED")
                    .map((p) => ({ value: p.id, label: p.title })),
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asg-due">Due</Label>
              <Input id="asg-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Rubric</Label>
              {rubric.map((item, i) => (
                <div key={item.id} className="grid grid-cols-[1fr_5rem] gap-2">
                  <Input
                    value={item.criterion}
                    onChange={(e) => {
                      const next = [...rubric];
                      next[i] = { ...item, criterion: e.target.value };
                      setRubric(next);
                    }}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.maxMarks}
                    onChange={(e) => {
                      const next = [...rubric];
                      next[i] = { ...item, maxMarks: Number(e.target.value) };
                      setRubric(next);
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRubric([...rubric, { id: `c${rubric.length + 1}`, criterion: "New criterion", maxMarks: 5 }])
                }
              >
                Add criterion
              </Button>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
