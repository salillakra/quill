"use client";

import { ArrowRight, Check, Database, FileOutput, FileType, Puzzle, ScanText, ShieldCheck, Table2, Wand2, X, Loader2 } from "lucide-react";
import type { Job, StageStatus } from "@/lib/types";
import { cn, formatMs } from "@/lib/utils";

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  convert: FileType,
  ocr: ScanText,
  chunk: Puzzle,
  embed: Database,
  parse: Wand2,
  validate: ShieldCheck,
  integrate: Table2,
  generate: Wand2,
  render: FileOutput,
};

const STAGE_LABELS: Record<string, string> = {
  convert: "Convert",
  ocr: "OCR",
  chunk: "Chunk",
  embed: "Embed",
  parse: "Parse",
  validate: "Validate",
  integrate: "Integrate",
  generate: "Generate",
  render: "Render PDF",
};

const STAGE_COLORS: Record<StageStatus, string> = {
  pending: "border-slate-800 bg-slate-900/60 text-slate-600",
  running: "stage-running border-amber-500/50 bg-amber-500/10 text-amber-300",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  failed: "border-rose-500/50 bg-rose-500/10 text-rose-300",
};

function StageChip({ name, status, durationMs }: { name: string; status: StageStatus; durationMs?: number }) {
  const Icon = STAGE_ICONS[name] ?? Loader2;
  return (
    <div className={cn("flex w-28 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-colors", STAGE_COLORS[status])}>
      <Icon className="size-5" />
      <span className="text-[11px] font-medium">{STAGE_LABELS[name] ?? name}</span>
      <span className="text-[10px] opacity-70">
        {status === "done" && durationMs ? formatMs(durationMs) : status === "running" ? "running…" : status}
      </span>
    </div>
  );
}

export function PipelineDag({
  job,
  onRetry,
}: {
  job: Job | undefined | null;
  onRetry?: (jobId: string) => void;
}) {
  if (!job) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-600">
        No pipeline run for this operation yet.
      </div>
    );
  }

  const stages = job.stages.length > 0 ? job.stages : [];
  const last = stages[stages.length - 1];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {job.type} pipeline
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {job.status === "FAILED" && <X className="size-3.5 text-rose-400" />}
          {job.status === "RUNNING" && <Loader2 className="size-3.5 animate-spin text-amber-400" />}
          {job.status === "SUCCEEDED" && <Check className="size-3.5 text-emerald-400" />}
          {job.status}
          {job.error && <span className="max-w-56 truncate text-rose-400" title={job.error}>· {job.error}</span>}
          {job.status === "FAILED" && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(job.id)}
              className="rounded-md border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/10"
            >
              Retry
            </button>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2">
            <StageChip name={s.name} status={s.status} durationMs={s.durationMs} />
            {i < stages.length - 1 && <ArrowRight className="size-4 text-slate-700" />}
          </div>
        ))}
        {stages.length === 0 && <span className="text-xs text-slate-600">queued…</span>}
      </div>
      {job.status === "SUCCEEDED" && last?.durationMs && (
        <p className="mt-2 text-[11px] text-slate-600">Total: {formatMs(stages.reduce((s, x) => s + (x.durationMs ?? 0), 0))}</p>
      )}
    </div>
  );
}
