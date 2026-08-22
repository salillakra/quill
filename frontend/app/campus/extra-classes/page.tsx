"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canMutateCampus } from "@/lib/roles";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ExtraClassesPage() {
  return (
    <ExtraClassesContent />
  );
}

function ExtraClassesContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateCampus(me.data?.role);
  const { data, isPending } = useQuery({ queryKey: ["campus-extra"], queryFn: api.listExtraClasses });
  const faculty = useQuery({ queryKey: ["campus-faculty"], queryFn: api.listFaculty });
  const rooms = useQuery({ queryKey: ["campus-rooms"], queryFn: api.listRooms });
  const courses = useQuery({ queryKey: ["campus-courses"], queryFn: api.listCourses });
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalInput(now));
  const [endsAt, setEndsAt] = useState(toLocalInput(later));
  const [facultyId, setFacultyId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [roomId, setRoomId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createExtraClass({
        title,
        notes: notes || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        facultyId,
        courseId: courseId || null,
        roomId: roomId || null,
      }),
    onSuccess: () => {
      toast.success("Extra class added");
      setOpen(false);
      setTitle("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["campus-extra"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteExtraClass(id),
    onSuccess: () => {
      toast.success("Removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["campus-extra"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extra classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">One-off sessions that appear on Today alongside the extracted grid.</p>
        </div>
        {canMutate && <Button onClick={() => setOpen(true)}>Add extra class</Button>}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<CalendarPlus className="size-5" />} title="No extra classes" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Faculty</TableHead>
              <TableHead>Course / room</TableHead>
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(row.startsAt).toLocaleString()} – {new Date(row.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
                <TableCell>{row.faculty?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {[row.course?.code, row.room?.code].filter(Boolean).join(" · ") || "—"}
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
            <DialogTitle>Add extra class</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ex-title">Title</Label>
              <Input id="ex-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Faculty</Label>
              <FormSelect
                value={facultyId}
                onValueChange={setFacultyId}
                placeholder="Select"
                options={(faculty.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-start">Starts</Label>
                <Input id="ex-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-end">Ends</Label>
                <Input id="ex-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Course</Label>
              <FormSelect
                value={courseId}
                onValueChange={setCourseId}
                options={[
                  { value: "", label: "None" },
                  ...(courses.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Room</Label>
              <FormSelect
                value={roomId}
                onValueChange={setRoomId}
                options={[
                  { value: "", label: "None" },
                  ...(rooms.data ?? []).map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` })),
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ex-notes">Notes</Label>
              <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || !facultyId}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete extra class?"
        description="This removes the extra class and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
