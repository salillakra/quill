"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Spinner } from "@/components/status";
import { FacultyLinkBanner } from "@/components/faculty-link-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DAY_NAMES } from "@/lib/utils";

export default function TodayPage() {
  return (
    <TodayContent />
  );
}

function TodayContent() {
  const { data, isPending } = useQuery({ queryKey: ["campus-today"], queryFn: api.campusToday, refetchInterval: 60_000 });

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  const slots = data?.slots ?? [];
  const extras = data?.extraClasses ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.weekday}
          {data?.faculty ? ` · ${data.faculty.name}` : " · all faculty"}
        </p>
      </div>

      <FacultyLinkBanner />

      {(data?.dueAssignments?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h2 className="mb-2 text-sm font-medium">Due in the next 7 days</h2>
          <ul className="space-y-1 text-sm">
            {data!.dueAssignments.map((a) => (
              <li key={a.id}>
                <Link href={`/assessment/assignments/${a.id}`} className="text-primary hover:underline">
                  {a.title}
                </Link>
                <span className={new Date(a.dueAt).getTime() < Date.now() ? "ml-1 text-rose-400" : "text-muted-foreground"}>
                  {" · "}
                  {new Date(a.dueAt).getTime() < Date.now() ? "Overdue · " : ""}
                  {new Date(a.dueAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data?.invigilations?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Invigilation today</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {data!.invigilations.map((d) => (
              <li key={d.id}>
                Period {d.period} · {d.faculty?.name} · {d.room?.code ?? "no room"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {slots.length === 0 && extras.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-5" />}
          title="Nothing on the board"
          description="Extract a timetable PDF under Documents, or add an extra class. Educators linked to a Faculty row only see their own slots."
          action={
            <Button render={<Link href="/documents" />}>
              Extract a timetable
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Timetable slots</h2>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No regular slots today (weekend, or no extract yet).</p>
            ) : (
              <div className="grid gap-3">
                {slots.map((slot) => (
                  <Card key={slot.id} size="sm">
                    <CardHeader className="flex-row items-start justify-between gap-3">
                      <div>
                        <CardTitle>{slot.courseRef?.name ?? slot.course}</CardTitle>
                        <CardDescription>
                          {slot.timetable
                            ? `${slot.timetable.branch} · sem ${slot.timetable.semester}${slot.timetable.section ? ` · ${slot.timetable.section}` : ""}`
                            : DAY_NAMES[slot.day] ?? data?.weekday}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">Period {slot.period}</Badge>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{slot.facultyRef?.name ?? slot.faculty ?? "Unlinked faculty"}</span>
                      <span>{slot.roomRef ? `${slot.roomRef.code} · ${slot.roomRef.name}` : slot.room ?? "No room"}</span>
                      {slot.code && <span>{slot.code}</span>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Extra classes</h2>
            {extras.length === 0 ? (
              <p className="text-sm text-muted-foreground">No extra classes scheduled for today.</p>
            ) : (
              <div className="grid gap-3">
                {extras.map((ex) => (
                  <Card key={ex.id} size="sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="size-4 text-primary" />
                        {ex.title}
                      </CardTitle>
                      <CardDescription>
                        {new Date(ex.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(ex.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span>{ex.faculty?.name}</span>
                      {ex.course && <span>{ex.course.code} · {ex.course.name}</span>}
                      {ex.room && <span>{ex.room.code}</span>}
                      {ex.notes && <span>{ex.notes}</span>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
