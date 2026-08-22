"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Table2, Tags, Loader2, List, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Extraction } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { statusBadge } from "@/components/status";
import { TimetableGrid } from "./timetable-grid";
import { TimetableAnalyticsView } from "./timetable-analytics-view";

export function ExtractPanel({
  docId,
  canExtract,
  initialExtractions,
}: {
  docId: string;
  canExtract: boolean;
  initialExtractions?: Extraction[];
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"timetable" | "generic" | null>(null);

  const { data: extractions } = useQuery({
    queryKey: ["extractions", docId],
    queryFn: () => api.getExtractions(docId),
    enabled: docId !== "",
    initialData: initialExtractions,
    staleTime: 10_000,
  });

  async function run(kind: "timetable" | "generic") {
    setBusy(kind);
    try {
      await api.extract(docId, kind);
      queryClient.invalidateQueries({ queryKey: ["extractions", docId] });
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
    } finally {
      setBusy(null);
    }
  }

  const latest = extractions?.[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => run("timetable")} disabled={busy !== null || !canExtract} variant="outline">
          {busy === "timetable" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Table2 data-icon="inline-start" />}
          Pull timetable
        </Button>
        <Button onClick={() => run("generic")} disabled={busy !== null || !canExtract} variant="outline">
          {busy === "generic" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Tags data-icon="inline-start" />}
          Pull key details
        </Button>
      </div>
      {!canExtract ? (
        <p className="text-[11px] text-muted-foreground">Wait until the document is ready.</p>
      ) : null}

      {latest ? (
        <div className="fade-up flex flex-col gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{latest.kind === "TIMETABLE" ? "Timetable" : "Details"}</span>
            {statusBadge(latest.status)}
            <span className="ml-auto">{timeAgo(latest.createdAt)}</span>
          </div>

          {latest.kind === "TIMETABLE" && latest.timetable ? (
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent className="pt-4">
                  <TimetableGrid timetable={latest.timetable} />
                </CardContent>
              </Card>
              <TimetableAnalyticsView extractionId={latest.id} />
              {latest.status === "INTEGRATED" ? (
                <Link href="/campus/timetable" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  Open campus timetable <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </div>
          ) : null}

          {latest.kind === "TIMETABLE" && !latest.timetable && latest.status !== "REJECTED" ? (
            <Card>
              <CardContent className="pt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">Still arranging the grid…</p>
                <p className="text-sm text-muted-foreground">Refresh in a moment if nothing appears.</p>
              </CardContent>
            </Card>
          ) : null}

          {latest.kind === "GENERIC" ? (
            <Card>
              <CardContent className="pt-4">
                {latest.data?.summary ? <p className="mb-3 text-sm italic text-muted-foreground">“{latest.data.summary}”</p> : null}
                <div className="space-y-1.5">
                  {(latest.data?.entities ?? []).map((e: { key: string; value: string; confidence?: number }, i: number) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <span className="w-36 shrink-0 font-medium text-primary">{e.key}</span>
                      <span className="min-w-0 flex-1 break-words">{e.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {extractions && extractions.length > 1 ? (
            <div className="pt-1">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <List className="size-3" /> Earlier
              </div>
              <div className="space-y-1">
                {extractions.slice(1, 4).map((e: Extraction) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-24">{e.kind === "TIMETABLE" ? "Timetable" : "Details"}</span>
                    {statusBadge(e.status)}
                    <span className="ml-auto">{timeAgo(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
