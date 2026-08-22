"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocumentActions } from "@/components/document-actions";
import { DocumentProgress } from "@/components/document-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { DocumentDetail } from "@/lib/types";

export function DocumentOverviewLive({
  id,
  staff,
  initialDoc,
}: {
  id: string;
  staff: boolean;
  initialDoc: DocumentDetail;
}) {
  const qc = useQueryClient();
  const { data: doc } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.getDocument(id),
    initialData: initialDoc,
    staleTime: 10_000,
    refetchInterval: (q) => {
      const status = q.state.data?.status ?? initialDoc.status;
      return status === "PROCESSING" || status === "UPLOADED" ? 4000 : false;
    },
  });

  const current = doc ?? initialDoc;
  const ingestJob = current.jobs?.find((j) => j.type === "INGEST");

  const retry = useMutation({
    mutationFn: (jobId: string) => api.retryJob(jobId),
    onSuccess: () => {
      toast.success("Trying again");
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn’t retry"),
  });

  return (
    <div className="flex flex-col gap-6">
      <DocumentProgress
        status={current.status}
        retrying={retry.isPending}
        onRetry={current.status === "FAILED" && ingestJob ? () => retry.mutate(ingestJob.id) : undefined}
      />
      <DocumentActions id={id} ready={current.status === "READY"} staff={staff} />
      {current.ocrText ? (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Show extracted text
              </summary>
              <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {current.ocrText.slice(0, 4000)}
                {current.ocrText.length > 4000 ? "\n…" : ""}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
