"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner } from "@/components/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/utils";

export default function StudentAssignmentsPage() {
  return (
    <StudentAssignments />
  );
}

function StudentAssignments() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const { data, isPending } = useQuery({ queryKey: ["assessment-assignments"], queryFn: api.listAssignments });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My assignments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your answer script.
          {me.data?.studentId ? "" : " If you can’t submit, ask your teacher to add you to the class list."}
        </p>
      </div>
      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title="No assignments" description="Teachers publish assignments here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/student/assignments/${row.id}`} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.dueAt ? new Date(row.dueAt).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{timeAgo(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
