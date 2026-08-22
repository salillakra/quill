import { Suspense } from "react";
import { getPapers } from "@/lib/server-api";
import { PapersTable } from "./papers-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function PapersPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl rounded-xl" />}>
      <PapersData />
    </Suspense>
  );
}

async function PapersData() {
  const papers = await getPapers();
  return <PapersTable initialPapers={papers} />;
}
