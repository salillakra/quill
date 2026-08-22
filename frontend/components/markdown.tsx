"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

export function Markdown({
  children,
  streaming = false,
  className,
}: {
  children: string;
  streaming?: boolean;
  className?: string;
}) {
  if (!children) return null;
  return (
    <Streamdown
      className={cn("chat-md", className)}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      animated={streaming}
      parseIncompleteMarkdown
      caret={streaming ? "circle" : undefined}
      shikiTheme={["github-dark", "github-dark"]}
      lineNumbers={false}
      controls={{ table: true, code: !streaming, mermaid: false }}
    >
      {children}
    </Streamdown>
  );
}
