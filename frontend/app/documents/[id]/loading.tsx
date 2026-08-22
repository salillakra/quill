import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <Skeleton className="mb-6 h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
