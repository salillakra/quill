import { Suspense } from "react";
import { getDocument, getMe } from "@/lib/server-api";
import { canExtractGenerate } from "@/lib/roles";
import { DocumentChrome } from "@/components/document-chrome";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<Skeleton className="mb-6 h-28 w-full rounded-xl" />}>
        <DocumentHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function DocumentHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, me] = await Promise.all([getDocument(id), getMe()]);
  return <DocumentChrome doc={doc} staff={canExtractGenerate(me.role)} />;
}
