"use client";

import { useQuery } from "@tanstack/react-query";
import { Files, Layers, FileOutput, MessageSquare, Activity, TriangleAlert, Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { api } from "@/lib/api";
import { formatMs, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/status";

const ACCENTS = [
  "text-primary",
  "text-cyan-400",
  "text-fuchsia-400",
  "text-emerald-400",
  "text-amber-400",
  "text-rose-400",
];

export default function AnalyticsPage() {
  return (
    <AnalyticsContent />
  );
}

function AnalyticsContent() {
  const { data: summary } = useQuery({ queryKey: ["analytics-summary"], queryFn: api.analyticsSummary });
  const { data: latency } = useQuery({ queryKey: ["analytics-latency"], queryFn: api.pipelineLatency });
  const { data: activity } = useQuery({ queryKey: ["analytics-activity"], queryFn: api.activity });

  const loading = !summary;

  const chartData = (latency ?? []).map((l) => ({ name: l.stage, avgMs: l.avgMs, runs: l.runs }));
  const activityData = useActivitySeries(activity?.documents ?? [], activity?.queries ?? []);

  return (
    <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">Operational signals from the live pipeline.</p>
          </div>
          {summary?.demo && (
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">demo mode — no Gemini key</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="size-6 text-primary" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Documents" value={summary!.docs} icon={Files} accent={ACCENTS[0]} />
              <KpiCard label="Chunks" value={summary!.chunks} icon={Layers} accent={ACCENTS[1]} />
              <KpiCard label="Papers" value={summary!.papers} icon={FileOutput} accent={ACCENTS[2]} />
              <KpiCard label="Queries" value={summary!.queries} icon={MessageSquare} accent={ACCENTS[3]} />
              <KpiCard label="Avg pipeline" value={formatMs(summary!.avgPipelineMs)} icon={Timer} accent={ACCENTS[4]} />
              <KpiCard label="Failed jobs" value={summary!.failedJobs} icon={TriangleAlert} accent={ACCENTS[5]} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-200">Avg latency per pipeline stage</h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip
                        cursor={{ fill: "rgba(99,102,241,0.08)" }}
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 12 }}
                        formatter={(value) => [`${value}ms`, "avg"]}
                        labelFormatter={(label) => `stage: ${label}`}
                      />
                      <Bar dataKey="avgMs" fill="#818cf8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-60 items-center justify-center text-sm text-slate-600">No pipeline runs yet</div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-200">Activity — last 30 days</h3>
                {activityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={activityData} margin={{ left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(34,211,238,0.06)" }}
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 12 }}
                      />
                      <Bar dataKey="documents" name="documents" stackId="a" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="queries" name="queries" stackId="a" fill="#818cf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-60 items-center justify-center text-sm text-slate-600">No activity yet</div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
              <Activity className="size-3.5" />
              {summary!.users} users · {summary!.avgPipelineMs > 0 ? `avg ${formatMs(summary!.avgPipelineMs)} end-to-end ingest` : "no completed ingests yet"}
            </div>
          </>
        )}
      </div>
  );
}

function useActivitySeries(docs: { date: string; count: number }[], queries: { date: string; count: number }[]) {
  const map = new Map<string, { date: string; documents: number; queries: number }>();
  for (const d of docs) {
    const row = map.get(d.date) ?? { date: d.date, documents: 0, queries: 0 };
    row.documents += d.count;
    map.set(d.date, row);
  }
  for (const q of queries) {
    const row = map.get(q.date) ?? { date: q.date, documents: 0, queries: 0 };
    row.queries += q.count;
    map.set(q.date, row);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
