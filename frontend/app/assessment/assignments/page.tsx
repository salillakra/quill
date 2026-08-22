import { Suspense } from "react";
import { getAssignments, getMe, getPapers } from "@/lib/server-api";
import { canMutateAssessment } from "@/lib/roles";
import { AssignmentsList } from "./assignments-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl rounded-xl" />}>
      <AssignmentsData searchParams={searchParams} />
    </Suspense>
  );
}

async function AssignmentsData({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  const [{ paper }, assignments, papers, me] = await Promise.all([
    searchParams,
    getAssignments(),
    getPapers(),
    getMe(),
  ]);
  return (
    <AssignmentsList
      initialAssignments={assignments}
      initialPapers={papers}
      canMutate={canMutateAssessment(me.role)}
      paperFromQuery={paper ?? ""}
    />
  );
}
