import { Server } from "socket.io";
import { logger } from "../utils/logger";

/**
 * SocketManager: rooms are per-document, so progress events only reach
 * browsers watching that document.
 */
export class SocketManager {
  private static io: Server | null = null;

  static init(io: Server) {
    this.io = io;
    io.on("connection", (socket) => {
      socket.on("join:document", (docId: string) => {
        if (docId) {
          socket.join(`doc_${docId}`);
          socket.emit("joined:document", { docId });
        }
      });
      socket.on("disconnect", () => {
        /* noop */
      });
    });
    logger.info("SocketManager initialized");
  }

  static emitToDoc(docId: string, event: string, payload: unknown) {
    this.io?.to(`doc_${docId}`).emit(event, payload);
  }

  static broadcast(event: string, payload: unknown) {
    this.io?.emit(event, payload);
  }
}

export const SOCKET_EVENTS = {
  stage: "job:stage",
  docStatus: "doc:status",
  jobDone: "job:done",
  jobFailed: "job:failed",
  paperDone: "paper:done",
} as const;
