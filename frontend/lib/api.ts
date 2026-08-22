import type {
  Activity,
  AnalyticsSummary,
  AskResult,
  Assignment,
  AssignmentAnalytics,
  CampusTimetable,
  Course,
  DocumentDetail,
  DocumentSummary,
  ExtraClass,
  Extraction,
  Faculty,
  GradeRecord,
  InvigilationDuty,
  Job,
  QueryLog,
  QuestionPaper,
  Room,
  StageLatency,
  Student,
  Submission,
  TodayPayload,
  User,
  Role,
} from "./types";

export const API_BASE = typeof window === "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") : "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, base = API_BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers:
      init?.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  const body = await res.json();
  return body.data as T;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),
  listUsers: () =>
    request<{ id: string; email: string; name: string; role: Role }[]>("/api/auth/users"),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ changed: boolean }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listWorkspaces: () =>
    request<{ id: string; name: string; slug: string }[]>("/api/auth/workspaces"),
  createWorkspace: (body: { name: string; slug: string }) =>
    request<{ id: string; name: string; slug: string }>("/api/auth/workspaces", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  switchWorkspace: (workspaceId: string) =>
    request<User>("/api/auth/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),

  // documents
  listDocuments: () => request<DocumentSummary[]>("/api/documents"),
  getDocument: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),
  uploadDocument: (file: File, title: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    return request<{ document: DocumentSummary; job: Job }>(
      "/api/documents",
      { method: "POST", body: form },
      process.env.NEXT_PUBLIC_API_URL ?? API_BASE,
    );
  },
  deleteDocument: (id: string) =>
    request<{ deleted: string }>(`/api/documents/${id}`, { method: "DELETE" }),
  reingestDocument: (id: string) =>
    request<{ document: DocumentSummary; job: Job }>(`/api/documents/${id}/reingest`, { method: "POST" }),

  // extraction
  extract: (docId: string, kind: "timetable" | "generic") =>
    request<{ job: Job }>(`/api/documents/${docId}/extract`, {
      method: "POST",
      body: JSON.stringify({ kind }),
    }),
  getExtractions: (docId: string) =>
    request<Extraction[]>(`/api/documents/${docId}/extractions`),
  getTimetableAnalytics: (extractionId: string) =>
    request<import("./types").TimetableAnalytics>(
      `/api/extractions/${extractionId}/timetable/analytics`,
    ),

  // generation
  generatePaper: (
    docId: string,
    config: {
      title: string;
      questionTypes: string[];
      numberOfQuestions: number;
      totalMarks: number;
      difficulty: string;
      institution?: string;
      courseCode?: string;
      durationMinutes?: number;
      instructions?: string;
      includeAnswerKey?: boolean;
      targetBloomsLevel?: string;
    },
  ) =>
    request<{ paper: QuestionPaper; job: Job }>(
      `/api/documents/${docId}/generate-paper`,
      {
        method: "POST",
        body: JSON.stringify(config),
      },
    ),
  getPapers: (docId: string) =>
    request<QuestionPaper[]>(`/api/documents/${docId}/papers`),

  // rag
  ask: (docId: string, question: string) =>
    request<AskResult>(`/api/documents/${docId}/ask`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),
  askStream: async (
    docId: string,
    question: string,
    onEvent: (event: string, data: unknown) => void,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/ask/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question }),
      signal,
    });
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
    if (!res.body) throw new ApiError(500, "No stream body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        let event = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        const raw = dataLines.join("\n");
        let data: unknown = raw;
        try {
          data = JSON.parse(raw);
        } catch {
          /* keep raw */
        }
        onEvent(event, data);
      }
    }
  },
  getQueries: (docId: string) =>
    request<QueryLog[]>(`/api/documents/${docId}/queries`),

  // jobs
  listJobs: () => request<Job[]>("/api/jobs"),
  retryJob: (id: string) =>
    request<{ retried: string }>(`/api/jobs/${id}/retry`, { method: "POST" }),

  // papers (global & studio)
  listPapers: () =>
    request<(QuestionPaper & { document?: { id: string; title: string } })[]>(
      "/api/papers",
    ),
  getPaper: (id: string) =>
    request<
      QuestionPaper & {
        document?: { id: string; title: string; ocrText: string };
      }
    >(`/api/papers/${id}`),
  updatePaper: (id: string, payload: any) =>
    request<QuestionPaper>(`/api/papers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  regenerateQuestion: (
    id: string,
    payload: {
      sectionIndex: number;
      questionIndex: number;
      type?: string;
      difficulty?: string;
      bloomsLevel?: string;
    },
  ) =>
    request<{ newQuestion: any; paper: QuestionPaper }>(
      `/api/papers/${id}/regenerate-question`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  exportPaperUrl: (
    id: string,
    format: "pdf" | "docx" | "latex" | "md" = "pdf",
    answerKey: boolean = true,
  ) =>
    `${API_BASE}/api/papers/${id}/export?format=${format}&answerKey=${answerKey}`,

  // analytics
  analyticsSummary: () => request<AnalyticsSummary>("/api/analytics/summary"),
  pipelineLatency: () =>
    request<StageLatency>("/api/analytics/pipeline-latency"),
  activity: () => request<Activity>("/api/analytics/activity"),

  campusToday: () => request<TodayPayload>("/api/campus/today"),
  listFaculty: () => request<Faculty[]>("/api/campus/faculty"),
  createFaculty: (body: {
    name: string;
    email: string;
    userId?: string | null;
  }) =>
    request<Faculty>("/api/campus/faculty", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFaculty: (
    id: string,
    body: Partial<{ name: string; email: string; userId: string | null }>,
  ) =>
    request<Faculty>(`/api/campus/faculty/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteFaculty: (id: string) =>
    request<{ deleted: string }>(`/api/campus/faculty/${id}`, {
      method: "DELETE",
    }),
  listRooms: () => request<Room[]>("/api/campus/rooms"),
  createRoom: (body: {
    code: string;
    name: string;
    capacity?: number | null;
  }) =>
    request<Room>("/api/campus/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRoom: (
    id: string,
    body: Partial<{ code: string; name: string; capacity: number | null }>,
  ) =>
    request<Room>(`/api/campus/rooms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRoom: (id: string) =>
    request<{ deleted: string }>(`/api/campus/rooms/${id}`, {
      method: "DELETE",
    }),
  listCourses: () => request<Course[]>("/api/campus/courses"),
  createCourse: (body: { code: string; name: string }) =>
    request<Course>("/api/campus/courses", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCourse: (id: string, body: Partial<{ code: string; name: string }>) =>
    request<Course>(`/api/campus/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCourse: (id: string) =>
    request<{ deleted: string }>(`/api/campus/courses/${id}`, {
      method: "DELETE",
    }),
  listTimetables: () => request<CampusTimetable[]>("/api/campus/timetables"),
  generateTimetable: (body: {
    branch: string;
    semester: number;
    section?: string | null;
    offerings: { courseId: string; facultyId: string; roomId?: string | null; periodsPerWeek: number }[];
  }) =>
    request<{ timetable: CampusTimetable; unplaced: { courseId: string; remaining: number }[] }>(
      "/api/campus/timetables/generate",
      { method: "POST", body: JSON.stringify(body) },
    ),
  timetableCsvUrl: (id: string) => `${API_BASE}/api/campus/timetables/${id}/export.csv`,
  listInvigilations: () => request<InvigilationDuty[]>("/api/campus/invigilations"),
  allocateInvigilation: (body: { date: string; periods: number[]; roomIds?: string[] }) =>
    request<InvigilationDuty[]>("/api/campus/invigilations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchTimetable: (id: string, body: Partial<{ branch: string; semester: number; section: string | null }>) =>
    request<CampusTimetable>(`/api/campus/timetables/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTimetable: (id: string) =>
    request<{ deleted: string }>(`/api/campus/timetables/${id}`, { method: "DELETE" }),
  patchSlot: (id: string, body: Record<string, unknown>) =>
    request<CampusTimetable["slots"][number]>(`/api/campus/slots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listExtraClasses: () => request<ExtraClass[]>("/api/campus/extra-classes"),
  createExtraClass: (body: {
    title: string;
    notes?: string | null;
    startsAt: string;
    endsAt: string;
    facultyId: string;
    courseId?: string | null;
    roomId?: string | null;
  }) =>
    request<ExtraClass>("/api/campus/extra-classes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteExtraClass: (id: string) =>
    request<{ deleted: string }>(`/api/campus/extra-classes/${id}`, {
      method: "DELETE",
    }),

  listStudents: () => request<Student[]>("/api/assessment/students"),
  createStudent: (body: { name: string; section: string; rollNo: string }) =>
    request<Student>("/api/assessment/students", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStudent: (id: string, body: { userId?: string | null; name?: string; section?: string; rollNo?: string }) =>
    request<Student>(`/api/assessment/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  linkParent: (studentId: string, parentUserId: string) =>
    request<{ id: string }>(`/api/assessment/students/${studentId}/parents`, {
      method: "POST",
      body: JSON.stringify({ parentUserId }),
    }),
  unlinkParent: (studentId: string, parentUserId: string) =>
    request<{ deleted: boolean }>(`/api/assessment/students/${studentId}/parents/${parentUserId}`, {
      method: "DELETE",
    }),
  deleteStudent: (id: string) =>
    request<{ deleted: string }>(`/api/assessment/students/${id}`, { method: "DELETE" }),
  listAssignments: () => request<Assignment[]>("/api/assessment/assignments"),
  createAssignment: (body: {
    title: string;
    rubric: { id: string; criterion: string; maxMarks: number }[];
    questionPaperId?: string | null;
    dueAt?: string | null;
  }) =>
    request<Assignment>("/api/assessment/assignments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAssignment: (id: string) =>
    request<Assignment & { submissions: Submission[] }>(
      `/api/assessment/assignments/${id}`,
    ),
  uploadSubmission: (assignmentId: string, studentId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("studentId", studentId);
    return request<{ submission: Submission; job: Job }>(
      `/api/assessment/assignments/${assignmentId}/submissions`,
      {
        method: "POST",
        body: form,
      },
    );
  },
  listGrading: () => request<Submission[]>("/api/assessment/grading"),
  overrideGrade: (
    id: string,
    body: { finalScores: GradeRecord["finalScores"]; feedback?: string | null },
  ) =>
    request<GradeRecord>(`/api/assessment/grades/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  assignmentAnalytics: (id: string) =>
    request<AssignmentAnalytics>(`/api/assessment/assignments/${id}/analytics`),
  assignmentAnalyticsCsvUrl: (id: string) =>
    `${API_BASE}/api/assessment/assignments/${id}/analytics.csv`,
  parentGrades: () =>
    request<
      {
        student: { id: string; name: string; section: string; rollNo: string };
        submissions: Submission[];
      }[]
    >("/api/assessment/parent/grades"),
};

export function pdfUrl(paper: QuestionPaper): string {
  return api.exportPaperUrl(paper.id, "pdf");
}
