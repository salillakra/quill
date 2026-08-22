"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileText, FileType2, FileImage, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FORMATS = [
  { ext: "PDF", icon: FileText },
  { ext: "PNG / JPG", icon: FileImage },
  { ext: "TXT / MD", icon: FileType2 },
];

export function Dropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const res = await api.uploadDocument(file, file.name.replace(/\.[^.]+$/, ""));
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        toast.success(`“${res.document.title}” is being prepared`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [queryClient],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!uploading) inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        dragging ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50",
        uploading && "pointer-events-none opacity-70",
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-xl border transition-transform",
          dragging ? "scale-105 border-primary/60 bg-primary/15 text-primary" : "border-border bg-muted text-primary",
        )}
      >
        {uploading ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
      </div>
      <div>
        <p className="text-sm font-medium">
          {uploading ? "Uploading…" : dragging ? "Drop to add it" : "Drag a file here, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, images, or text — up to 25 MB.</p>
      </div>
      <div className="flex items-center gap-2">
        {FORMATS.map((f) => {
          const Icon = f.icon;
          return (
            <span key={f.ext} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              <Icon className="size-3" /> {f.ext}
            </span>
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
