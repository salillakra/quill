import Link from "next/link";
import { FileOutput, MessageSquare, Table2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DocumentActions({
  id,
  ready,
  staff,
}: {
  id: string;
  ready: boolean;
  staff: boolean;
}) {
  const hint = ready ? undefined : "Available once this document has been read.";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ActionCard
        href={`/documents/${id}/ask`}
        icon={MessageSquare}
        title="Ask"
        description="Ask questions about this document. Answers cite the page."
        hint={hint}
      />
      {staff ? (
        <>
          <ActionCard
            href={`/documents/${id}/extract`}
            icon={Table2}
            title="Timetable"
            description="Pull a timetable or key details from this file."
            hint={hint}
          />
          <ActionCard
            href={`/documents/${id}/paper`}
            icon={FileOutput}
            title="Create paper"
            description="Turn this document into a question paper."
            hint={hint}
          />
        </>
      ) : null}
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <Link href={href} className="card-hover block rounded-xl">
      <Card className="h-full">
        <CardHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {hint ? (
          <CardContent>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}
