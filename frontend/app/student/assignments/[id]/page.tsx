"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useJobsSocket } from "@/lib/socket";
import { EmptyState, Spinner, statusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StudentAssignmentDetailPage() {
  return (
    <StudentAssignmentDetail />
  );
}

function StudentAssignmentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  useJobsSocket([["assessment-assignment", id]]);
  const { data, isPending } = useQuery({
    queryKey: ["assessment-assignment", id],
    queryFn: () => api.getAssignment(id),
  });
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Pick a file");
      const studentId = me.data?.studentId;
      if (!studentId) throw new Error("Ask your teacher to add you to the class list");
      return api.uploadSubmission(id, studentId, file);
    },
    onSuccess: () => {
      toast.success("Script uploaded");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["assessment-assignment", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }
  if (!data) return <EmptyState title="Assignment not found" />;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.dueAt ? `Due ${new Date(data.dueAt).toLocaleString()}` : "No due date"}
        </p>
      </div>
      <div className="grid gap-3 rounded-xl border border-border p-4">
        <Label htmlFor="stu-script">Upload answer script</Label>
        <Input id="stu-script" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={() => upload.mutate()} disabled={upload.isPending || !file || !me.data?.studentId}>
          Submit
        </Button>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Your submissions</h2>
        {!data.submissions?.length ? (
          <EmptyState title="No scripts yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Feedback</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.submissions.map((sub) => (
                <TableRow key={sub.id}>
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
      </div>
    </div>
  );
}
