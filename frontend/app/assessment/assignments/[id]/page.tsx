import { Suspense } from "react";
import { getAssignment, getMe, getStudents } from "@/lib/server-api";
import { canMutateAssessment } from "@/lib/roles";
import { AssignmentDetail } from "../../../../components/assignment-detail";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-5xl rounded-xl" />}>
      <AssignmentBody params={params} />
    </Suspense>
  );
}

async function AssignmentBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [assignment, students, me] = await Promise.all([getAssignment(id), getStudents(), getMe()]);
  return (
    <AssignmentDetail
      id={id}
      initialAssignment={assignment}
      initialStudents={students}
      canMutate={canMutateAssessment(me.role)}
    />
  );
}
