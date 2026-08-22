"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { EmptyState, Spinner } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/form-select";

export default function ClassAnalyticsPage() {
  return (
    <AnalyticsContent />
  );
}

function AnalyticsContent() {
  const assignments = useQuery({ queryKey: ["assessment-assignments"], queryFn: api.listAssignments });
  const [id, setId] = useState<string>("");
  const selected = id || assignments.data?.[0]?.id || "";
  const stats = useQuery({
    queryKey: ["assessment-analytics", selected],
    queryFn: () => api.assignmentAnalytics(selected),
    enabled: Boolean(selected),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Class analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mean, median, and per-criterion averages after grading.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assignments.data && assignments.data.length > 0 && (
            <FormSelect
              className="max-w-sm"
              value={selected}
              onValueChange={setId}
              options={assignments.data.map((a) => ({ value: a.id, label: a.title }))}
            />
          )}
          {selected && (
            <Button size="sm" variant="outline" render={<a href={api.assignmentAnalyticsCsvUrl(selected)} />}>
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {!assignments.data?.length ? (
        <EmptyState
          title="No assignments"
          description="Create an assignment and grade scripts to see class stats."
          action={
            <Button variant="outline" render={<Link href="/assessment/assignments" />}>
              Open assignments
            </Button>
          }
        />
      ) : stats.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-primary" />
        </div>
      ) : !stats.data ? (
        <EmptyState title="No analytics" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Submissions" value={stats.data.submissionCount} />
            <Kpi label="Graded" value={stats.data.gradedCount} />
            <Kpi label="Mean" value={stats.data.mean.toFixed(1)} />
            <Kpi label="Median" value={stats.data.median.toFixed(1)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Per-criterion average</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.data.perCriterion.length === 0 || stats.data.gradedCount === 0 ? (
                <p className="text-sm text-muted-foreground">No graded scripts yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.data.perCriterion.map((c) => ({ name: c.criterion, avg: Number(c.avg.toFixed(2)), max: c.maxMarks }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(99,102,241,0.08)" }}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 12 }}
                    />
                    <Bar dataKey="avg" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-2xl">{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardHeader>
    </Card>
  );
}
