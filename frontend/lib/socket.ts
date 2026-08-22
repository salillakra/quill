"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

/** Engine.IO via the Next rewrite 308s `/socket.io/` then 404s on `/socket.io`. Talk to the API host. */
function socketOrigin() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

/**
 * Joins the document's Socket.IO room and invalidates the relevant
 * TanStack Query keys on every pipeline event.
 */
export function useDocSocket(docId: string | null, deps: string[] = ["document", "documents"]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!docId) return;
    const socket = io(socketOrigin(), { withCredentials: true, transports: ["websocket", "polling"] });

    const bump = () => {
      for (const k of deps) {
        queryClient.invalidateQueries({ queryKey: k === "documents" ? [k] : [k, docId] });
      }
    };

    socket.on("connect", () => socket.emit("join:document", docId));
    socket.on("job:stage", bump);
    socket.on("doc:status", bump);
    socket.on("job:done", bump);
    socket.on("paper:done", bump);
    socket.on("job:failed", bump);

    return () => {
      socket.disconnect();
    };
  }, [docId, queryClient]);
}

/** Invalidate query keys on any pipeline/grade broadcast (no document room). */
export function useJobsSocket(queryKeys: string[][]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(socketOrigin(), { withCredentials: true, transports: ["websocket", "polling"] });
    const bump = () => {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    };
    socket.on("job:stage", bump);
    socket.on("doc:status", bump);
    socket.on("job:done", bump);
    socket.on("job:failed", bump);
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);
}
