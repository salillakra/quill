"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const ACCENT = [
  "from-primary/25 to-primary/10 text-primary",
  "from-emerald-500/25 to-teal-500/10 text-emerald-300",
  "from-amber-500/25 to-orange-500/10 text-amber-300",
  "from-sky-500/25 to-cyan-500/10 text-sky-300",
  "from-rose-500/25 to-red-500/10 text-rose-300",
  "from-chart-5/40 to-muted text-muted-foreground",
];

export function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: number | string;
  hint?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-edge/70 bg-surface/70 p-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="mt-3 h-6 w-16" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
    );
  }
  const accentCls =
    typeof accent === "number"
      ? ACCENT[accent % ACCENT.length]
      : accent ?? ACCENT[0];
  return (
    <div className="card-hover rounded-2xl border border-edge/70 bg-surface/70 p-4">
      <div className={cn("mb-3 flex size-9 items-center justify-center rounded-xl bg-linear-to-br ring-1 ring-inset ring-white/10", accentCls)}>
        <Icon className="size-4.5" />
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
