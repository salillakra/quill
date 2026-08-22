import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import type {
  Assignment,
  DocumentDetail,
  DocumentSummary,
  QueryLog,
  QuestionPaper,
  Student,
  Submission,
  User,
} from "@/lib/types";

const API = process.env.API_PROXY_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T> {
  const cookie = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${API}${path}`, {
    headers: { cookie },
  });
  if (res.status === 401) redirect("/login");
  if (res.status === 404) notFound();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  const body = await res.json();
  return body.data as T;
}

export async function getMe() {
  return get<User>("/api/auth/me");
}

export async function getDocuments() {
  return get<DocumentSummary[]>("/api/documents");
}

export async function getDocument(id: string) {
  return get<DocumentDetail>(`/api/documents/${id}`);
}

export async function getPapers() {
  return get<(QuestionPaper & { document?: { id: string; title: string } })[]>("/api/papers");
}

export async function getQueries(id: string) {
  return get<QueryLog[]>(`/api/documents/${id}/queries`);
}

export async function getGrading() {
  return get<Submission[]>("/api/assessment/grading");
}

export async function getAssignments() {
  return get<Assignment[]>("/api/assessment/assignments");
}

export async function getAssignment(id: string) {
  return get<Assignment & { submissions: Submission[] }>(`/api/assessment/assignments/${id}`);
}

export async function getStudents() {
  return get<Student[]>("/api/assessment/students");
}
