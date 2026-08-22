import { Suspense } from "react";
import { getGrading, getMe } from "@/lib/server-api";
import { canMutateAssessment } from "@/lib/roles";
import { GradingQueue } from "./grading-client";
import { Skeleton } from "@/components/ui/skeleton";

export default function GradingPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl rounded-xl" />}>
      <GradingData />
    </Suspense>
  );
}

async function GradingData() {
  const [rows, me] = await Promise.all([getGrading(), getMe()]);
  return <GradingQueue initialRows={rows} canMutate={canMutateAssessment(me.role)} />;
}
