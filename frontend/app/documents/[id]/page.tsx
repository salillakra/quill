import { Suspense } from "react";
import { getDocument, getMe } from "@/lib/server-api";
import { canExtractGenerate } from "@/lib/roles";
import { DocumentOverviewLive } from "@/components/document-overview-live";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, me] = await Promise.all([getDocument(id), getMe()]);
  return <DocumentOverviewLive id={id} staff={canExtractGenerate(me.role)} initialDoc={doc} />;
}
