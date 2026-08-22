"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, FileOutput } from "lucide-react";
import { api, pdfUrl } from "@/lib/api";
import { statusBadge, EmptyState } from "@/components/status";
import { timeAgo } from "@/lib/utils";
import { PaperStudio } from "@/components/paper-studio";
import { PageHeader } from "@/components/page-header";
import type { QuestionPaper } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PaperRow = QuestionPaper & { document?: { id: string; title: string } };

export function PapersTable({ initialPapers }: { initialPapers: PaperRow[] }) {
  const { data: papers, refetch } = useQuery({
    queryKey: ["papers"],
    queryFn: api.listPapers,
    initialData: initialPapers,
    staleTime: 10_000,
  });
  const [selectedPaper, setSelectedPaper] = useState<QuestionPaper | null>(null);
  const list = papers ?? initialPapers;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Papers"
        description="Edit and export question papers. Mark student scripts under Mark scripts."
      />

      {list.length > 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paper</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Marks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <FileOutput className="size-4 shrink-0 text-primary" />
                      <button
                        type="button"
                        onClick={() => setSelectedPaper(p)}
                        className="text-left font-medium hover:text-primary"
                      >
                        {p.title}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.document?.id ? (
                      <Link href={`/documents/${p.document.id}/paper`} className="hover:text-primary">
                        {p.document.title ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{p.totalMarks}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{timeAgo(p.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.status === "COMPLETED" ? (
                        <Button size="sm" variant="outline" onClick={() => setSelectedPaper(p)}>
                          Studio
                        </Button>
                      ) : null}
                      {p.document?.id ? (
                        <Button size="sm" variant="ghost" render={<Link href={`/documents/${p.document.id}/ask`} />}>
                          Ask source
                        </Button>
                      ) : null}
                      {p.status === "COMPLETED" && p.pdfUrl ? (
                        <Button size="sm" variant="outline" render={<a href={pdfUrl(p)} target="_blank" rel="noreferrer" />}>
                          <Download data-icon="inline-start" /> PDF
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<FileOutput className="size-5" />}
          title="No papers yet"
          description="Open a document, choose Create paper, then come back here to edit and export."
          action={<Button render={<Link href="/documents" />}>Go to library</Button>}
        />
      )}

      {selectedPaper ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[92vh] w-full flex-col">
            <PaperStudio
              paper={selectedPaper}
              onClose={() => {
                setSelectedPaper(null);
                refetch();
              }}
              onUpdate={(updated) => {
                setSelectedPaper(updated);
                refetch();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
