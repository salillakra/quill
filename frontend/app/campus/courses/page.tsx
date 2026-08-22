"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canMutateCampus } from "@/lib/roles";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";

export default function CoursesPage() {
  return (
    <CoursesContent />
  );
}

function CoursesContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateCampus(me.data?.role);
  const { data, isPending } = useQuery({ queryKey: ["campus-courses"], queryFn: api.listCourses });
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.createCourse({ code, name }),
    onSuccess: () => {
      toast.success("Course added");
      setOpen(false);
      setCode("");
      setName("");
      qc.invalidateQueries({ queryKey: ["campus-courses"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCourse(id),
    onSuccess: () => {
      toast.success("Course removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["campus-courses"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Course codes used when filling the timetable.</p>
        </div>
        {canMutate && <Button onClick={() => setOpen(true)}>Add course</Button>}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<BookOpen className="size-5" />} title="No courses yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                {canMutate && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(row.id)}>
                      Delete
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add course</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="course-code">Code</Label>
              <Input id="course-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="course-name">Name</Label>
              <Input id="course-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete course?"
        description="This removes the course and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
