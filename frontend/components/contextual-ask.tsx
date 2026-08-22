"use client";

import { AskPanel } from "@/components/ask-panel";
import { QuillMascot } from "@/components/quill-mascot";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ContextualAskDialog({
  docId,
  title,
  open,
  onOpenChange,
}: {
  docId: string | null;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <QuillMascot size="sm" />
            Ask · {title}
          </DialogTitle>
        </DialogHeader>
        {docId ? <AskPanel docId={docId} canAsk /> : <p className="text-sm text-muted-foreground">No source document.</p>}
      </DialogContent>
    </Dialog>
  );
}
