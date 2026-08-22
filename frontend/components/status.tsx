"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export { Skeleton };

const STATUS_MAP: Record<string, { cls: string; pulse?: boolean; label: string }> = {
  READY: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "Ready" },
  PROCESSING: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", pulse: true, label: "Preparing" },
  UPLOADED: { cls: "border-primary/30 bg-primary/10 text-primary", pulse: true, label: "Received" },
  FAILED: { cls: "border-destructive/30 bg-destructive/10 text-destructive", label: "Couldn't finish" },
  QUEUED: { cls: "border-border bg-muted text-muted-foreground", label: "Waiting" },
  RUNNING: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", pulse: true, label: "Working" },
  SUCCEEDED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "Done" },
  RETRYING: { cls: "border-orange-500/30 bg-orange-500/10 text-orange-300", pulse: true, label: "Trying again" },
  COMPLETED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "Done" },
  PENDING: { cls: "border-border bg-muted text-muted-foreground", pulse: true, label: "Pending" },
  VALIDATED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "Checked" },
  INTEGRATED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "On the timetable" },
  REJECTED: { cls: "border-destructive/30 bg-destructive/10 text-destructive", label: "Needs a look" },
  GRADING: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", pulse: true, label: "Grading" },
  GRADED: { cls: "border-primary/30 bg-primary/10 text-primary", label: "Graded" },
  REVIEWED: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", label: "Released" },
};

export function statusBadge(status: string) {
  const conf = STATUS_MAP[status] ?? { cls: "border-border bg-muted text-muted-foreground", label: status };
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", conf.cls)}>
      <span className={cn("size-1.5 rounded-full bg-current", conf.pulse && "dot-pulse")} />
      {conf.label}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
