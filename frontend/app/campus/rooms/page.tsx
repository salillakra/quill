"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen } from "lucide-react";
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

export default function RoomsPage() {
  return (
    <RoomsContent />
  );
}

function RoomsContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateCampus(me.data?.role);
  const { data, isPending } = useQuery({ queryKey: ["campus-rooms"], queryFn: api.listRooms });
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createRoom({
        code,
        name,
        capacity: capacity ? Number(capacity) : null,
      }),
    onSuccess: () => {
      toast.success("Room added");
      setOpen(false);
      setCode("");
      setName("");
      setCapacity("");
      qc.invalidateQueries({ queryKey: ["campus-rooms"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRoom(id),
    onSuccess: () => {
      toast.success("Room removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["campus-rooms"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rooms</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lecture halls and labs referenced by timetable slots.</p>
        </div>
        {canMutate && <Button onClick={() => setOpen(true)}>Add room</Button>}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<DoorOpen className="size-5" />} title="No rooms yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Capacity</TableHead>
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.capacity ?? "—"}</TableCell>
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
            <DialogTitle>Add room</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="room-code">Code</Label>
              <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-name">Name</Label>
              <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-cap">Capacity</Label>
              <Input id="room-cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
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
        title="Delete room?"
        description="This removes the room and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
