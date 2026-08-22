"use client";

import { useQuery } from "@tanstack/react-query";
import { Files, UploadCloud, FileOutput } from "lucide-react";
import { Dropzone } from "@/components/dropzone";
import { DocumentCard } from "@/components/document-card";
import { FacultyLinkBanner } from "@/components/faculty-link-banner";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { useJobsSocket } from "@/lib/socket";
import { EmptyState, Skeleton } from "@/components/status";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentSummary } from "@/lib/types";

export function DocumentsLibrary({ initialDocs }: { initialDocs: DocumentSummary[] }) {
  useJobsSocket([["documents"]]);
  const { data: docs, isPending } = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
    initialData: initialDocs,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const list = query.state.data as { status: string }[] | undefined;
      return list?.some((d) => d.status === "PROCESSING" || d.status === "UPLOADED") ? 4000 : false;
    },
  });

  const list = docs ?? initialDocs;
  const preparing = list.filter((d) => d.status === "PROCESSING" || d.status === "UPLOADED").length;
  const papers = list.reduce((s, d) => s + (d._count?.papers ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Library"
        description="Upload a syllabus, notes, or a timetable PDF. Then ask it, pull a timetable, or create a paper."
      />

      <FacultyLinkBanner />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Files className="size-4" />
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums leading-none">{isPending && !list.length ? "—" : list.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <UploadCloud className="size-4" />
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums leading-none">{preparing}</p>
              <p className="mt-1 text-xs text-muted-foreground">Preparing</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <FileOutput className="size-4" />
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums leading-none">{papers}</p>
              <p className="mt-1 text-xs text-muted-foreground">Papers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <Dropzone />
      </div>

      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<UploadCloud className="size-5" />}
          title="No documents yet"
          description="Drop a PDF above — a syllabus, scanned timetable, or notes."
        />
      )}
    </div>
  );
}
