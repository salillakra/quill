import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDocument, getMe } from "@/lib/server-api";
import { canExtractGenerate } from "@/lib/roles";
import { GeneratePanel } from "@/components/generate-panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <PaperBody params={params} />
    </Suspense>
  );
}

async function PaperBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, me] = await Promise.all([getDocument(id), getMe()]);
  if (!canExtractGenerate(me.role)) notFound();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Create a question paper from this document. Edit it under Papers, then mark scripts under Mark scripts.
      </p>
      <GeneratePanel docId={id} canGenerate={doc.status === "READY"} initialPapers={doc.papers} />
    </div>
  );
}
