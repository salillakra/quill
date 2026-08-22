"use client";

import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner, statusBadge } from "@/components/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ParentGradesPage() {
  return (
    <ParentGrades />
  );
}

function ParentGrades() {
  const { data, isPending } = useQuery({ queryKey: ["parent-grades"], queryFn: api.parentGrades });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Grades</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scores for your children, once teachers release them.</p>
      </div>
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<GraduationCap className="size-5" />} title="No linked students" description="Ask an admin to link this parent account." />
      ) : (
        <div className="space-y-8">
          {data.map((block) => (
            <section key={block.student.id}>
              <h2 className="mb-3 text-sm font-medium">
                {block.student.name} · {block.student.section} · {block.student.rollNo}
              </h2>
              {!block.submissions.length ? (
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Feedback</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.submissions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>{sub.assignment?.title ?? "—"}</TableCell>
                        <TableCell>{statusBadge(sub.status)}</TableCell>
                        <TableCell>{sub.status === "REVIEWED" && sub.grade ? sub.grade.total : "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {sub.status === "REVIEWED" ? (sub.grade?.feedback ?? "—") : "Awaiting teacher review"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
