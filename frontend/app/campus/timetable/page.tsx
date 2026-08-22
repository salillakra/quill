"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canMutateCampus } from "@/lib/roles";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimetableGrid } from "@/components/timetable-grid";
import { ContextualAskDialog } from "@/components/contextual-ask";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";
import type { CampusSlot } from "@/lib/types";

export default function TimetablePage() {
  return (
    <TimetableContent />
  );
}

function TimetableContent() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const canMutate = canMutateCampus(me.data?.role);
  const { data: timetables, isPending } = useQuery({ queryKey: ["campus-timetables"], queryFn: api.listTimetables });
  const faculty = useQuery({ queryKey: ["campus-faculty"], queryFn: api.listFaculty });
  const rooms = useQuery({ queryKey: ["campus-rooms"], queryFn: api.listRooms });
  const courses = useQuery({ queryKey: ["campus-courses"], queryFn: api.listCourses });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slot, setSlot] = useState<CampusSlot | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [branch, setBranch] = useState("CSE");
  const [semester, setSemester] = useState(3);
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0, 10));
  const [pendingDelete, setPendingDelete] = useState(false);
  const [offerings, setOfferings] = useState<
    { courseId: string; facultyId: string; roomId: string; periodsPerWeek: number }[]
  >([]);

  useEffect(() => {
    if (!genOpen) return;
    const facId = faculty.data?.[0]?.id ?? "";
    const roomId = rooms.data?.[0]?.id ?? "";
    setOfferings(
      (courses.data ?? []).map((c) => ({
        courseId: c.id,
        facultyId: facId,
        roomId,
        periodsPerWeek: 3,
      })),
    );
  }, [genOpen, courses.data, faculty.data, rooms.data]);

  const current = timetables?.find((t) => t.id === selectedId) ?? timetables?.[0] ?? null;

  const save = useMutation({
    mutationFn: () => {
      if (!slot) throw new Error("No slot");
      const fac = faculty.data?.find((f) => f.id === (slot.facultyId ?? ""));
      const room = rooms.data?.find((r) => r.id === (slot.roomId ?? ""));
      const course = courses.data?.find((c) => c.id === (slot.courseId ?? ""));
      return api.patchSlot(slot.id, {
        course: slot.course,
        code: slot.code,
        room: room?.code ?? slot.room,
        faculty: fac?.name ?? slot.faculty,
        facultyId: slot.facultyId || null,
        roomId: slot.roomId || null,
        courseId: slot.courseId || null,
      });
    },
    onSuccess: () => {
      toast.success("Slot updated");
      setSlot(null);
      qc.invalidateQueries({ queryKey: ["campus-timetables"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const generate = useMutation({
    mutationFn: () => {
      if (!offerings.length) throw new Error("Add courses first");
      if (offerings.some((o) => !o.facultyId)) throw new Error("Pick faculty for every course");
      return api.generateTimetable({
        branch,
        semester,
        offerings: offerings.map((o) => ({
          courseId: o.courseId,
          facultyId: o.facultyId,
          roomId: o.roomId || null,
          periodsPerWeek: o.periodsPerWeek,
        })),
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.unplaced.length
          ? `Generated with ${res.unplaced.length} unplaced offering(s)`
          : "Timetable generated",
      );
      setGenOpen(false);
      qc.invalidateQueries({ queryKey: ["campus-timetables"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Generate failed"),
  });

  const invigilate = useMutation({
    mutationFn: () =>
      api.allocateInvigilation({
        date: new Date(invDate).toISOString(),
        periods: [1, 2],
        roomIds: (rooms.data ?? []).map((r) => r.id),
      }),
    onSuccess: (rows) => {
      toast.success(`Assigned ${rows.length} invigilation duties`);
      setInvOpen(false);
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Allocate failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTimetable(id),
    onSuccess: () => {
      toast.success("Timetable deleted");
      setPendingDelete(false);
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["campus-timetables"] });
      qc.invalidateQueries({ queryKey: ["campus-today"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Extract a timetable from a PDF in the library, then edit cells here. Names that aren’t in your directory stay as text until you link them.
          </p>
        </div>
        {canMutate && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGenOpen(true)}>Generate from master data</Button>
            <Button variant="outline" onClick={() => setInvOpen(true)}>Allocate invigilation</Button>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !timetables?.length ? (
        <EmptyState
          icon={<Clock className="size-5" />}
          title="No timetable yet"
          description="Upload a timetable PDF in Documents and run Extract → timetable."
          action={
            <Button render={<Link href="/documents" />}>Go to documents</Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {timetables.length > 1 && (
            <FormSelect
              className="max-w-sm"
              value={current?.id ?? ""}
              onValueChange={setSelectedId}
              options={timetables.map((t) => ({
                value: t.id,
                label: `${t.branch} · sem ${t.semester}${t.section ? ` · ${t.section}` : ""}`,
              }))}
            />
          )}
          {current && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <CardTitle>
                  {current.branch} · semester {current.semester}
                  {current.section ? ` · ${current.section}` : ""}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {current.extraction?.documentId && (
                    <Button size="sm" variant="outline" onClick={() => setAskOpen(true)}>
                      Ask this timetable
                    </Button>
                  )}
                  <Button size="sm" variant="outline" render={<a href={api.timetableCsvUrl(current.id)} />}>
                    Export CSV
                  </Button>
                  {canMutate && (
                    <Button size="sm" variant="outline" onClick={() => setPendingDelete(true)}>
                      Delete
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <TimetableGrid timetable={current} onSlotClick={canMutate ? (s) => setSlot(s as CampusSlot) : undefined} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit slot</DialogTitle>
          </DialogHeader>
          {slot && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="slot-course">Course</Label>
                <Input id="slot-course" value={slot.course} onChange={(e) => setSlot({ ...slot, course: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="slot-code">Code</Label>
                <Input id="slot-code" value={slot.code ?? ""} onChange={(e) => setSlot({ ...slot, code: e.target.value || null })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Link course</Label>
                <FormSelect
                  value={slot.courseId ?? ""}
                  onValueChange={(id) => {
                    const hit = courses.data?.find((c) => c.id === id);
                    setSlot({
                      ...slot,
                      courseId: id || null,
                      course: hit?.name ?? slot.course,
                      code: hit?.code ?? slot.code,
                    });
                  }}
                  options={[
                    { value: "", label: "Unresolved" },
                    ...(courses.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Link faculty</Label>
                <FormSelect
                  value={slot.facultyId ?? ""}
                  onValueChange={(id) => {
                    const hit = faculty.data?.find((f) => f.id === id);
                    setSlot({ ...slot, facultyId: id || null, faculty: hit?.name ?? slot.faculty });
                  }}
                  options={[
                    { value: "", label: "Unresolved" },
                    ...(faculty.data ?? []).map((f) => ({ value: f.id, label: f.name })),
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Link room</Label>
                <FormSelect
                  value={slot.roomId ?? ""}
                  onValueChange={(id) => {
                    const hit = rooms.data?.find((r) => r.id === id);
                    setSlot({ ...slot, roomId: id || null, room: hit?.code ?? slot.room });
                  }}
                  options={[
                    { value: "", label: "Unresolved" },
                    ...(rooms.data ?? []).map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` })),
                  ]}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ContextualAskDialog
        docId={current?.extraction?.documentId ?? null}
        title={current ? `${current.branch} timetable` : "Timetable"}
        open={askOpen}
        onOpenChange={setAskOpen}
      />

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate timetable</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              generate.mutate();
            }}
          >
            <p className="text-xs text-muted-foreground">
              Greedy clash-avoiding fill. Set faculty, room, and periods per course.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-branch">Branch</Label>
              <Input id="gen-branch" value={branch} onChange={(e) => setBranch(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gen-sem">Semester</Label>
              <Input id="gen-sem" type="number" min={1} value={semester} onChange={(e) => setSemester(Number(e.target.value))} required />
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {offerings.map((off) => {
                const course = courses.data?.find((c) => c.id === off.courseId);
                return (
                  <div key={off.courseId} className="grid gap-1.5 rounded-md border border-border/60 p-2 sm:grid-cols-4">
                    <p className="sm:col-span-4 text-xs font-medium">{course?.code} · {course?.name}</p>
                    <FormSelect
                      value={off.facultyId}
                      onValueChange={(id) =>
                        setOfferings((rows) =>
                          rows.map((r) => (r.courseId === off.courseId ? { ...r, facultyId: id } : r)),
                        )
                      }
                      placeholder="Faculty"
                      options={(faculty.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
                    />
                    <FormSelect
                      value={off.roomId}
                      onValueChange={(id) =>
                        setOfferings((rows) =>
                          rows.map((r) => (r.courseId === off.courseId ? { ...r, roomId: id } : r)),
                        )
                      }
                      placeholder="Room"
                      options={(rooms.data ?? []).map((r) => ({ value: r.id, label: r.code }))}
                    />
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={off.periodsPerWeek}
                      onChange={(e) =>
                        setOfferings((rows) =>
                          rows.map((r) =>
                            r.courseId === off.courseId ? { ...r, periodsPerWeek: Number(e.target.value) } : r,
                          ),
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={generate.isPending || !offerings.length}>
                Generate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate invigilation</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              invigilate.mutate();
            }}
          >
            <p className="text-xs text-muted-foreground">
              Assigns least-loaded faculty who are free in periods 1–2 to every room.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-date">Date</Label>
              <Input id="inv-date" type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={invigilate.isPending}>
                Allocate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title="Delete timetable?"
        description="This removes the generated grid and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => current && remove.mutate(current.id)}
      />
    </div>
  );
}
