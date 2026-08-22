import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDocument, getMe } from "@/lib/server-api";
import { canExtractGenerate } from "@/lib/roles";
import { ExtractPanel } from "@/components/extract-panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExtractPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <ExtractBody params={params} />
    </Suspense>
  );
}

async function ExtractBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, me] = await Promise.all([getDocument(id), getMe()]);
  if (!canExtractGenerate(me.role)) notFound();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pull a timetable from this PDF, then open Campus → Timetable to edit it.
      </p>
      <ExtractPanel docId={id} canExtract={doc.status === "READY"} initialExtractions={doc.extractions} />
    </div>
  );
}
