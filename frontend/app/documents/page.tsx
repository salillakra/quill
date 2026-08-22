import { Suspense } from "react";
import { getDocuments } from "@/lib/server-api";
import { DocumentsLibrary } from "./library-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsPage() {
  return (
    <Suspense fallback={<LibraryFallback />}>
      <LibraryData />
    </Suspense>
  );
}

async function LibraryData() {
  const docs = await getDocuments();
  return <DocumentsLibrary initialDocs={docs} />;
}

function LibraryFallback() {
  return (
    <div className="mx-auto max-w-6xl">
      <Skeleton className="mb-6 h-16 w-80" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
