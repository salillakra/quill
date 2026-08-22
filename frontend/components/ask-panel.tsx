"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Send, User } from "lucide-react";
import { api } from "@/lib/api";
import type { AskResult, QueryLog, Source } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QuillMascot } from "@/components/quill-mascot";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Markdown } from "@/components/markdown";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/status";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  thinking?: boolean;
  error?: boolean;
};

function fromHistory(logs: QueryLog[]): ChatMessage[] {
  return [...logs].reverse().flatMap((q) => [
    { id: `${q.id}-u`, role: "user" as const, content: q.question },
    {
      id: `${q.id}-a`,
      role: "assistant" as const,
      content: q.answer,
      sources: Array.isArray(q.sources) ? q.sources : [],
    },
  ]);
}

export function AskPanel({
  docId,
  canAsk = true,
  initialHistory,
}: {
  docId: string;
  canAsk?: boolean;
  initialHistory?: QueryLog[];
}) {
  const queryClient = useQueryClient();
  const { data: liveDoc } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api.getDocument(docId),
    enabled: Boolean(docId),
    staleTime: 5_000,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "PROCESSING" || status === "UPLOADED" ? 4000 : false;
    },
  });
  const ready = (liveDoc?.status ?? (canAsk ? "READY" : "PROCESSING")) === "READY";
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialHistory ? fromHistory(initialHistory) : [],
  );
  const [asking, setAsking] = useState(false);
  const seeded = useRef<string | null>(initialHistory ? docId : null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: history } = useQuery({
    queryKey: ["queries", docId],
    queryFn: () => api.getQueries(docId),
    enabled: docId !== "",
    initialData: initialHistory,
    staleTime: 10_000,
  });

  useEffect(() => {
    seeded.current = null;
    setMessages([]);
  }, [docId]);

  useEffect(() => {
    if (!history) return;
    if (seeded.current === docId) return;
    seeded.current = docId;
    setMessages(fromHistory(history));
  }, [history, docId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const empty = messages.length === 0 && !asking;
  const thinking = asking || messages.some((m) => m.thinking || m.streaming);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = question.trim();
    if (!text || asking || !ready) return;

    const userId = `local-u-${Date.now()}`;
    const assistantId = `local-a-${Date.now()}`;
    setQuestion("");
    setAsking(true);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", thinking: true, streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const patchAssistant = (partial: Partial<ChatMessage>) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...partial } : m)));
    };

    try {
      await api.askStream(
        docId,
        text,
        (event, data) => {
          if (event === "meta") {
            const meta = data as { sources?: Source[] };
            patchAssistant({ thinking: false, sources: meta.sources });
          } else if (event === "delta") {
            const delta = data as { text?: string };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, thinking: false, streaming: true, content: m.content + (delta.text ?? "") }
                  : m,
              ),
            );
          } else if (event === "done") {
            const done = data as AskResult;
            patchAssistant({
              thinking: false,
              streaming: false,
              content: done.answer,
              sources: done.sources,
            });
          } else if (event === "error") {
            const err = data as { message?: string };
            patchAssistant({
              thinking: false,
              streaming: false,
              error: true,
              content: err.message ?? "Ask failed",
            });
          }
        },
        ctrl.signal,
      );
      queryClient.invalidateQueries({ queryKey: ["queries", docId] });
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      patchAssistant({
        thinking: false,
        streaming: false,
        error: true,
        content: err instanceof Error ? err.message : "Ask failed",
      });
    } finally {
      setAsking(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[min(72vh,720px)] min-h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <QuillMascot size="sm" mood={thinking ? "thinking" : empty ? "idle" : "happy"} />
          Ask Quill
        </div>
        <p className="text-[11px] text-muted-foreground">Answers cite the page they came from</p>
      </div>
      <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor" scrollPreviousItemPeek={64}>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-5 px-4 py-5">
              {empty && (
                <MessageScrollerItem messageId="empty">
                  <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 text-center">
                    <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                      <QuillMascot size="lg" mood="idle" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Ask anything about this document</p>
                      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        Try “summarize the unit on recursion” or “what’s on page 12?” Press Enter to send.
                      </p>
                    </div>
                  </div>
                </MessageScrollerItem>
              )}

              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                  className={message.streaming ? "[content-visibility:visible]" : undefined}
                >
                  <ChatRow message={message} />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form onSubmit={send} className="border-t border-border bg-background/70 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-input bg-input/30 p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!ready || asking}
            placeholder={ready ? "Ask anything about this document…" : "Almost ready — this document is still being read…"}
            className="min-h-10 max-h-32 flex-1 resize-none border-0 bg-transparent px-2.5 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
            rows={1}
          />
          <Button type="submit" size="icon" disabled={asking || !question.trim() || !ready} aria-label="Send">
            {asking ? <Spinner /> : <Send />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}

function ChatRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (message.thinking && !message.content) {
    return (
      <Message align="start">
        <MessageAvatar>
          <QuillMascot size="sm" mood="thinking" />
        </MessageAvatar>
        <MessageContent>
          <Marker role="status">
            <MarkerIcon>
              <Spinner className="size-4 text-primary" />
            </MarkerIcon>
            <MarkerContent className="shimmer">Reading the document…</MarkerContent>
          </Marker>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar>
        {isUser ? (
          <Avatar size="sm">
            <AvatarFallback className="bg-muted">
              <User className="size-3.5" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <QuillMascot size="sm" mood={message.streaming ? "thinking" : "happy"} />
        )}
      </MessageAvatar>
      <MessageContent>
        {!isUser && <MessageHeader>Quill</MessageHeader>}
        <Bubble
          variant={isUser ? "default" : message.error ? "destructive" : "ghost"}
          align={isUser ? "end" : "start"}
          className={cn(!isUser && "max-w-full")}
        >
          <BubbleContent className={cn(isUser ? "whitespace-pre-wrap" : "w-full max-w-full px-1")}>
            {isUser || message.error ? (
              <>
                {message.content || (message.streaming ? "" : "…")}
                {message.streaming && message.content ? (
                  <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-current align-[-1px]" />
                ) : null}
              </>
            ) : (
              <Markdown streaming={message.streaming}>{message.content}</Markdown>
            )}
          </BubbleContent>
        </Bubble>
        {message.streaming && !message.content ? (
          <Marker role="status">
            <MarkerContent className="shimmer">Writing…</MarkerContent>
          </Marker>
        ) : null}
        {!isUser && message.sources && message.sources.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From the document</p>
            <AttachmentGroup>
              {message.sources.map((s) => (
                <Attachment key={s.chunkId} size="sm" className="max-w-64" title={s.excerpt}>
                  <AttachmentMedia>
                    <BookOpen />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>Page {s.page}</AttachmentTitle>
                    <AttachmentDescription className="line-clamp-2 whitespace-normal">
                      {s.excerpt}
                    </AttachmentDescription>
                  </AttachmentContent>
                </Attachment>
              ))}
            </AttachmentGroup>
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}
