"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canMutateAssessment } from "@/lib/roles";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";

export default function StudentsPage() {
  return (
    <StudentsContent />
  );
}

function StudentsContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateAssessment(me.data?.role);
  const isAdmin = me.data?.role === "ADMIN";
  const { data, isPending } = useQuery({ queryKey: ["assessment-students"], queryFn: api.listStudents });
  const users = useQuery({
    queryKey: ["auth-users"],
    queryFn: api.listUsers,
    enabled: isAdmin,
  });
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [section, setSection] = useState("A");
  const [rollNo, setRollNo] = useState("");

  const studentUsers = (users.data ?? []).filter((u) => u.role === "STUDENT");
  const parentUsers = (users.data ?? []).filter((u) => u.role === "PARENT");

  const create = useMutation({
    mutationFn: () => api.createStudent({ name, section, rollNo }),
    onSuccess: () => {
      toast.success("Student added");
      setOpen(false);
      setName("");
      setSection("A");
      setRollNo("");
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const linkUser = useMutation({
    mutationFn: ({ studentId, userId }: { studentId: string; userId: string | null }) =>
      api.updateStudent(studentId, { userId }),
    onSuccess: () => {
      toast.success("Linked user updated");
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Link failed"),
  });

  const linkParent = useMutation({
    mutationFn: ({ studentId, parentUserId }: { studentId: string; parentUserId: string }) =>
      api.linkParent(studentId, parentUserId),
    onSuccess: () => {
      toast.success("Parent linked");
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Link failed"),
  });

  const unlinkParent = useMutation({
    mutationFn: ({ studentId, parentUserId }: { studentId: string; parentUserId: string }) =>
      api.unlinkParent(studentId, parentUserId),
    onSuccess: () => {
      toast.success("Parent unlinked");
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unlink failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteStudent(id),
    onSuccess: () => {
      toast.success("Student removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["assessment-students"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Roster for answer scripts. Link a STUDENT login and PARENT accounts here.
          </p>
        </div>
        {canMutate && <Button onClick={() => setOpen(true)}>Add student</Button>}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<Contact className="size-5" />}
          title="No students yet"
          description="Add a roster so assignments can attach answer scripts to a roll number."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Roll no</TableHead>
              <TableHead>Linked user</TableHead>
              <TableHead>Parents</TableHead>
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.section}</TableCell>
                <TableCell>{row.rollNo}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <FormSelect
                      value={row.userId ?? ""}
                      onValueChange={(id) => linkUser.mutate({ studentId: row.id, userId: id || null })}
                      options={[
                        { value: "", label: "Unlinked" },
                        ...(row.user && !studentUsers.some((u) => u.id === row.userId)
                          ? [{ value: row.user.id, label: `${row.user.email} · ${row.user.role.toLowerCase()}` }]
                          : []),
                        ...studentUsers.map((u) => ({
                          value: u.id,
                          label: `${u.email} · ${u.role.toLowerCase()}`,
                        })),
                      ]}
                    />
                  ) : (
                    <span className="text-muted-foreground">{row.user?.email ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <div className="flex min-w-48 flex-col gap-1">
                      {(row.parentLinks ?? []).map((link) => (
                        <div key={link.id} className="flex items-center justify-between gap-2 text-xs">
                          <span>{link.parent.email}</span>
                          <button
                            type="button"
                            className="text-rose-300 hover:underline"
                            onClick={() => unlinkParent.mutate({ studentId: row.id, parentUserId: link.parentUserId })}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <FormSelect
                        value=""
                        placeholder="Add parent"
                        onValueChange={(id) => {
                          if (id) linkParent.mutate({ studentId: row.id, parentUserId: id });
                        }}
                        options={parentUsers
                          .filter((u) => !(row.parentLinks ?? []).some((l) => l.parentUserId === u.id))
                          .map((u) => ({ value: u.id, label: u.email }))}
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {(row.parentLinks ?? []).map((l) => l.parent.email).join(", ") || "—"}
                    </span>
                  )}
                </TableCell>
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
            <DialogTitle>Add student</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="stu-name">Name</Label>
              <Input id="stu-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stu-section">Section</Label>
              <Input id="stu-section" value={section} onChange={(e) => setSection(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stu-roll">Roll no</Label>
              <Input id="stu-roll" value={rollNo} onChange={(e) => setRollNo(e.target.value)} required />
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
        title="Delete student?"
        description="This removes the roster row and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
