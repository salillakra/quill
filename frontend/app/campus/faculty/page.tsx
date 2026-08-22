"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canMutateCampus } from "@/lib/roles";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";

export default function FacultyPage() {
  return (
    <FacultyContent />
  );
}

function FacultyContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateCampus(me.data?.role);
  const isAdmin = me.data?.role === "ADMIN";
  const { data, isPending } = useQuery({ queryKey: ["campus-faculty"], queryFn: api.listFaculty });
  const users = useQuery({
    queryKey: ["auth-users"],
    queryFn: api.listUsers,
    enabled: isAdmin,
  });
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const linkableUsers = (users.data ?? []).filter((u) => u.role === "EDUCATOR" || u.role === "ADMIN");

  const create = useMutation({
    mutationFn: () => api.createFaculty({ name, email }),
    onSuccess: () => {
      toast.success("Faculty added");
      setOpen(false);
      setName("");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["campus-faculty"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const linkUser = useMutation({
    mutationFn: ({ facultyId, userId }: { facultyId: string; userId: string | null }) =>
      api.updateFaculty(facultyId, { userId }),
    onSuccess: () => {
      toast.success("Linked user updated");
      qc.invalidateQueries({ queryKey: ["campus-faculty"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Link failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFaculty(id),
    onSuccess: () => {
      toast.success("Faculty removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["campus-faculty"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faculty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master list used to link extracted timetable slots and Today. Linking an EDUCATOR user makes Today personal.
          </p>
        </div>
        {canMutate && <Button onClick={() => setOpen(true)}>Add faculty</Button>}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<Users className="size-5" />} title="No faculty yet" description="Add people so extract can resolve names onto Faculty rows." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Linked user</TableHead>
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <FormSelect
                      value={row.userId ?? ""}
                      onValueChange={(id) => linkUser.mutate({ facultyId: row.id, userId: id || null })}
                      options={[
                        { value: "", label: "Unlinked" },
                        ...(row.user && !linkableUsers.some((u) => u.id === row.userId)
                          ? [{ value: row.user.id, label: `${row.user.email} · ${row.user.role.toLowerCase()}` }]
                          : []),
                        ...linkableUsers.map((u) => ({
                          value: u.id,
                          label: `${u.email} · ${u.role.toLowerCase()}`,
                        })),
                      ]}
                    />
                  ) : (
                    <span className="text-muted-foreground">{row.user?.email ?? "—"}</span>
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
            <DialogTitle>Add faculty</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="faculty-name">Name</Label>
              <Input id="faculty-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="faculty-email">Email</Label>
              <Input id="faculty-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
        title="Delete faculty?"
        description="This removes the faculty row and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
