import { prisma } from "../config/db";
import type { SessionUser } from "./auth.service";
import type { InputJsonValue } from "@prisma/client/runtime/library";

export interface AuditContext {
  action: string;
  entity?: string;
  entityId?: string;
  user?: SessionUser | null;
  ip?: string;
  metadata?: InputJsonValue;
}

let pendingLogs: AuditContext[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Record an audit log entry (batched for performance).
 * Flushes every 5 seconds or when buffer reaches 100 entries.
 */
export async function auditLog(ctx: AuditContext): Promise<void> {
  pendingLogs.push(ctx);
  if (pendingLogs.length >= 100) {
    await flushAuditLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushAuditLogs, 5000);
  }
}

/**
 * Immediately flush all pending audit logs to the database.
 */
export async function flushAuditLogs(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingLogs.length === 0) return;

  const logs = [...pendingLogs];
  pendingLogs = [];

  try {
    await prisma.auditLog.createMany({
      data: logs.map((l) => ({
        action: l.action,
        entity: l.entity ?? null,
        entityId: l.entityId ?? null,
        userId: l.user?.id ?? null,
        workspaceId: l.user?.workspaceId ?? null,
        ip: l.ip ?? null,
        metadata: l.metadata ?? {},
      })),
    });
  } catch (err) {
    // Re-queue on failure (non-blocking)
    console.error("Audit log flush failed:", err);
    pendingLogs.unshift(...logs);
  }
}

/**
 * Middleware to extract client IP from request.
 */
export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? undefined;
}

/**
 * Create a standardized audit action name.
 */
export const AuditAction = {
  // Auth
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  LOGIN_FAILED: "auth.login_failed",
  TOKEN_REFRESH: "auth.token_refresh",
  PASSWORD_CHANGE: "auth.password_change",

  // User management
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",
  USER_ROLE_CHANGE: "user.role_change",

  // Workspace
  WORKSPACE_CREATE: "workspace.create",
  WORKSPACE_UPDATE: "workspace.update",
  WORKSPACE_DELETE: "workspace.delete",

  // Document
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_DELETE: "document.delete",
  DOCUMENT_REINGEST: "document.reingest",
  DOCUMENT_DOWNLOAD: "document.download",

  // Extraction
  EXTRACTION_START: "extraction.start",
  EXTRACTION_COMPLETE: "extraction.complete",

  // Generation
  PAPER_GENERATE: "paper.generate",
  PAPER_REGENERATE_QUESTION: "paper.regenerate_question",
  PAPER_EXPORT: "paper.export",
  PAPER_DELETE: "paper.delete",

  // RAG
  DOCUMENT_ASK: "document.ask",

  // Jobs
  JOB_RETRY: "job.retry",

  // Campus
  FACULTY_CREATE: "faculty.create",
  FACULTY_UPDATE: "faculty.update",
  FACULTY_DELETE: "faculty.delete",
  ROOM_CREATE: "room.create",
  ROOM_UPDATE: "room.update",
  ROOM_DELETE: "room.delete",
  COURSE_CREATE: "course.create",
  COURSE_UPDATE: "course.update",
  COURSE_DELETE: "course.delete",
  TIMETABLE_GENERATE: "timetable.generate",
  TIMETABLE_UPDATE: "timetable.update",
  TIMETABLE_DELETE: "timetable.delete",
  EXTRA_CLASS_CREATE: "extra_class.create",
  EXTRA_CLASS_DELETE: "extra_class.delete",
  INVIGILATION_ALLOCATE: "invigilation.allocate",

  // Assessment
  ASSIGNMENT_CREATE: "assignment.create",
  ASSIGNMENT_UPDATE: "assignment.update",
  ASSIGNMENT_DELETE: "assignment.delete",
  SUBMISSION_UPLOAD: "submission.upload",
  SUBMISSION_GRADE: "submission.grade",
  GRADE_REVIEW: "grade.review",

  // Settings
  SETTINGS_UPDATE: "settings.update",
} as const;