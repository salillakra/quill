"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, statusBadge } from "@/components/status";
import { useJobsSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GradeOverrideDialog } from "@/components/grade-override";
import type { Submission } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export function GradingQueue({
  initialRows,
  canMutate,
}: {
  initialRows: Submission[];
  canMutate: boolean;
}) {
  useJobsSocket([["assessment-grading"]]);
  const { data } = useQuery({
    queryKey: ["assessment-grading"],
    queryFn: api.listGrading,
    initialData: initialRows,
    staleTime: 10_000,
  });
  const [override, setOverride] = useState<Submission | null>(null);
  const list = data ?? initialRows;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Mark scripts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check answers, override scores, then release them.</p>
      </div>

      {!list.length ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title="Queue is empty"
          description="Upload an answer script from an assignment."
          action={
            <Button variant="outline" render={<Link href="/assessment/assignments" />}>
              Open assignments
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assignment</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI / final</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell>
                  <Link href={`/assessment/assignments/${sub.assignmentId}`} className="hover:underline">
                    {sub.assignment?.title ?? "Assignment"}
                  </Link>
                </TableCell>
                <TableCell>
                  {sub.student?.name} · {sub.student?.rollNo}
                </TableCell>
                <TableCell>{statusBadge(sub.status)}</TableCell>
                <TableCell>{sub.grade ? sub.grade.total : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{timeAgo(sub.createdAt)}</TableCell>
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

      <GradeOverrideDialog submission={override} open={!!override} onOpenChange={(o) => !o && setOverride(null)} />
    </div>
  );
}
