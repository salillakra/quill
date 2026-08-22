import { Suspense } from "react";
import { getDocument, getQueries } from "@/lib/server-api";
import { AskPanel } from "@/components/ask-panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function AskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-112 w-full rounded-xl" />}>
      <AskBody params={params} />
    </Suspense>
  );
}

async function AskBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, history] = await Promise.all([getDocument(id), getQueries(id)]);
  return <AskPanel docId={id} canAsk={doc.status === "READY"} initialHistory={history} />;
}
