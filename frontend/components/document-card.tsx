"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, FileOutput, ChevronRight, FileImage, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DocumentSummary } from "@/lib/types";
import { cn, timeAgo, formatBytes } from "@/lib/utils";
import { statusBadge } from "@/components/status";
import { ConfirmDelete } from "@/components/confirm-delete";
import { api } from "@/lib/api";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PDF: FileText,
  IMAGE: FileImage,
  TEXT: FileText,
};

export function DocumentCard({ doc }: { doc: DocumentSummary }) {
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState(false);
  const Icon = KIND_ICON[doc.sourceKind] ?? FileText;
  const processing = doc.status === "PROCESSING" || doc.status === "UPLOADED";

  const remove = useMutation({
    mutationFn: () => api.deleteDocument(doc.id),
    onSuccess: () => {
      toast.success("Document deleted");
      setPendingDelete(false);
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <>
      <Link
        href={`/documents/${doc.id}`}
        className={cn(
          "card-hover group relative flex flex-col overflow-hidden rounded-xl border bg-card p-4",
          doc.status === "FAILED" ? "border-destructive/30" : "border-border",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="flex items-center gap-1">
            {statusBadge(doc.status)}
            <button
              type="button"
              aria-label="Delete document"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPendingDelete(true);
              }}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        <h3 className="truncate text-sm font-semibold">{doc.title}</h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {doc.filename} · {formatBytes(doc.size)}
        </p>
        {processing && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
            <div className="skeleton h-full w-2/3" />
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          {doc.pageCount ? <span>{doc.pageCount} pages</span> : null}
          <span className="flex items-center gap-1">
            <FileOutput className="size-3 text-primary" />
            {doc._count?.papers ?? 0} papers
          </span>
          <span className="ml-auto flex items-center gap-0.5 group-hover:text-primary">
            {timeAgo(doc.createdAt).replace(" ago", "")}
            <ChevronRight className="size-3.5" />
          </span>
        </div>
      </Link>
      <ConfirmDelete
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title="Delete document?"
        description="This removes the document and cannot be undone."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
