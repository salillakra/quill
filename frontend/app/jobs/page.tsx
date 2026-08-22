"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { statusBadge, Spinner } from "@/components/status";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

const STAGE_ORDER = ["convert", "ocr", "chunk", "embed", "parse", "validate", "integrate", "generate", "render", "grade"];

function StageBar({ stages }: { stages: { name: string; status: string }[] }) {
  const ordered = [...stages].sort((a, b) => STAGE_ORDER.indexOf(a.name) - STAGE_ORDER.indexOf(b.name));
  const done = ordered.filter((s) => s.status === "done").length;
  return (
    <div className="flex items-center gap-1">
      {ordered.map((s) => (
        <span
          key={s.name}
          title={`${s.name}: ${s.status}`}
          className={
            s.status === "done"
              ? "h-1.5 w-4 rounded-full bg-emerald-500"
              : s.status === "running"
                ? "h-1.5 w-4 animate-pulse rounded-full bg-amber-400"
                : s.status === "failed"
                  ? "h-1.5 w-4 rounded-full bg-rose-500"
                  : "h-1.5 w-4 rounded-full bg-slate-800"
          }
        />
      ))}
      <span className="ml-1.5 text-[10px] text-slate-600">{done}/{ordered.length}</span>
    </div>
  );
}

export default function JobsPage() {
  return (
    <JobsContent />
  );
}

function JobsContent() {
  const queryClient = useQueryClient();
  const { data: jobs, isPending } = useQuery({
    queryKey: ["jobs"],
    queryFn: api.listJobs,
    refetchInterval: 4000,
  });

  async function retry(id: string) {
    try {
      await api.retryJob(id);
      toast.success("Job re-queued");
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">Every job across ingest, extraction, generation, and grading — with per-stage state.</p>
        </div>

        {isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6 text-primary" />
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
                  <GitBranch className="size-3.5" /> {job.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{job.document?.title ?? job.documentId}</span>
                <StageBar stages={job.stages} />
                {statusBadge(job.status)}
                <span className="text-[11px] text-slate-600">{timeAgo(job.createdAt)}</span>
                {job.status === "FAILED" && (
                  <button
                    onClick={() => retry(job.id)}
                    className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-300"
                  >
                    <RotateCcw className="size-3" /> Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">
            No jobs yet — upload a document to start a pipeline.
          </div>
        )}
    </div>
  );
}
