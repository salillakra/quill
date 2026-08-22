"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DocumentSubnav } from "@/components/document-subnav";
import { statusBadge } from "@/components/status";
import { api } from "@/lib/api";
import { useDocSocket } from "@/lib/socket";
import { formatBytes, timeAgo } from "@/lib/utils";
import type { DocumentDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function DocumentChrome({
  doc,
  staff,
}: {
  doc: DocumentDetail;
  staff: boolean;
}) {
  const qc = useQueryClient();
  useDocSocket(doc.id);
  const { data } = useQuery({
    queryKey: ["document", doc.id],
    queryFn: () => api.getDocument(doc.id),
    initialData: doc,
    staleTime: 10_000,
    refetchInterval: (q) => {
      const status = q.state.data?.status ?? doc.status;
      return status === "PROCESSING" || status === "UPLOADED" ? 4000 : false;
    },
  });
  const current = data ?? doc;

  const reingest = useMutation({
    mutationFn: () => api.reingestDocument(current.id),
    onSuccess: () => {
      toast.success("Reading the document again");
      qc.invalidateQueries({ queryKey: ["document", current.id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn’t start again"),
  });

  return (
    <div className="mb-6 flex flex-col gap-4">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Library
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{current.title}</h1>
            {statusBadge(current.status)}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {current.filename} · {formatBytes(current.size)}
            {current.pageCount > 0 && ` · ${current.pageCount} pages`} · {timeAgo(current.createdAt)}
          </p>
        </div>
        {staff ? (
          <Button size="sm" variant="outline" onClick={() => reingest.mutate()} disabled={reingest.isPending}>
            <RefreshCw data-icon="inline-start" />
            Read again
          </Button>
        ) : null}
      </div>
      <DocumentSubnav id={current.id} staff={staff} />
    </div>
  );
}
