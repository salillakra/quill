"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DocumentProgress({
  status,
  onRetry,
  retrying,
}: {
  status: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const failed = status === "FAILED";
  const ready = status === "READY";
  const reading = status === "PROCESSING" || status === "UPLOADED";

  const steps: { label: string; done: boolean; active: boolean; error?: boolean }[] = [
    { label: "Received", done: true, active: false },
    { label: "Reading", done: ready, active: reading && !failed, error: failed },
    { label: "Ready to ask", done: ready, active: false },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {failed ? "Couldn’t finish reading" : ready ? "Ready" : "Preparing this document"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] font-medium",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : step.error
                      ? "border-destructive text-destructive"
                      : step.active
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                )}
              >
                {step.error ? (
                  <CircleAlert className="size-3.5" />
                ) : step.done ? (
                  <Check className="size-3.5" />
                ) : step.active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current opacity-40" />
                )}
              </span>
              <span className={cn(step.active || step.done ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </li>
          ))}
        </ol>
        {failed && onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            Try again
          </Button>
        ) : null}
        {!failed && !ready ? (
          <p className="text-xs text-muted-foreground">This usually takes a moment. You can keep browsing.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
