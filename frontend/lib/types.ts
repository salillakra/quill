export type Role = "ADMIN" | "EDUCATOR" | "ANALYST" | "STUDENT" | "PARENT";
export type DocStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type JobType = "INGEST" | "EXTRACT" | "GENERATE" | "GRADE";
export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYING";
export type StageStatus = "pending" | "running" | "done" | "failed";

export type BloomsLevel = "REMEMBER" | "UNDERSTAND" | "APPLY" | "ANALYZE" | "EVALUATE" | "CREATE";

export interface Stage {
  name: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  facultyId: string | null;
  studentId: string | null;
  workspaceId: string | null;
  workspace: { id: string; name: string; slug: string } | null;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  currentStage: string | null;
  stages: Stage[];
  error: string | null;
  documentId: string;
  createdAt: string;
  completedAt: string | null;
  document?: { id: string; title: string };
}

export interface DocumentSummary {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  pageCount: number;
  status: DocStatus;
  sourceKind: string;
  createdAt: string;
  updatedAt: string;
  _count?: { chunks: number; extractions: number; papers: number };
  jobs?: Job[];
}

export interface Chunk {
  id: string;
  index: number;
  content: string;
  page: number;
  tokenCount: number;
}

export interface DocumentDetail extends DocumentSummary {
  ocrText: string | null;
  chunks: Chunk[];
  jobs: Job[];
  extractions: Extraction[];
  papers: QuestionPaper[];
  _count?: { chunks: number; extractions: number; papers: number; queries: number };
}

export interface TimetableSlot {
  id: string;
  day: number;
  period: number;
  course: string;
  code: string | null;
  room: string | null;
  faculty: string | null;
}

export interface Timetable {
  id: string;
  branch: string;
  semester: number;
  section: string | null;
  extractionId: string | null;
  slots: TimetableSlot[];
}

export interface ClashWarning {
  id: string;
  type: "ROOM_CLASH" | "FACULTY_CLASH" | "OVERLOAD";
  day: number;
  dayName: string;
  period: number;
  locationOrPerson: string;
  conflictingCourses: string[];
  recommendation: string;
}

export interface RoomUtilization {
  room: string;
  occupiedSlots: number;
  totalPossibleSlots: number;
  utilizationRate: number;
  busyPeriods: { day: number; period: number }[];
}

export interface FacultyWorkload {
  faculty: string;
  totalSlots: number;
  assignedCourses: string[];
  maxConsecutiveHours: number;
}

export interface TimetableAnalytics {
  timetableId: string;
  branch: string;
  semester: number;
  section: string | null;
  totalSlots: number;
  uniqueRoomsCount: number;
  uniqueFacultyCount: number;
  uniqueCoursesCount: number;
  clashes: ClashWarning[];
  roomUtilizations: RoomUtilization[];
  facultyWorkloads: FacultyWorkload[];
  freeSlotsMatrix: { day: number; dayName: string; freeRooms: string[]; availablePeriods: number[] }[];
}

export interface Extraction {
  id: string;
  kind: "TIMETABLE" | "GENERIC";
  status: "PARSED" | "VALIDATED" | "REJECTED" | "INTEGRATED";
  data: any;
  confidence: number | null;
  documentId: string;
  createdAt: string;
  timetable?: Timetable | null;
}

export interface QuestionItem {
  id?: string;
  question: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
  type?: string;
  bloomsLevel?: BloomsLevel;
  options?: string[];
  answer?: string;
  solution?: string;
  rubric?: string[];
}

export interface PaperSection {
  title: string;
  instruction?: string | null;
  questions: QuestionItem[];
}

export interface QuestionPaper {
  id: string;
  title: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalMarks: number;
  config: any;
  sections: PaperSection[];
  pdfUrl: string | null;
  documentId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Source {
  chunkId: string;
  page: number;
  score: number;
  excerpt: string;
}

export interface QueryLog {
  id: string;
  question: string;
  answer: string;
  latencyMs: number;
  model: string;
  sources: Source[];
  documentId: string;
  createdAt: string;
}

export interface AskResult {
  answer: string;
  sources: Source[];
  latencyMs: number;
  model: string;
  demo: boolean;
}

export interface AnalyticsSummary {
  docs: number;
  chunks: number;
  papers: number;
  queries: number;
  users: number;
  failedJobs: number;
  avgPipelineMs: number;
  demo: boolean;
}

export type StageLatency = { stage: string; runs: number; avgMs: number }[];

export interface Activity {
  documents: { date: string; count: number }[];
  queries: { date: string; count: number }[];
}

export interface Faculty {
  id: string;
  name: string;
  email: string;
  userId: string | null;
  createdAt: string;
  user?: { id: string; email: string; role: Role } | null;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  createdAt: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  createdAt: string;
}

export interface CampusSlot extends TimetableSlot {
  facultyId: string | null;
  roomId: string | null;
  courseId: string | null;
  facultyRef?: Faculty | null;
  roomRef?: Room | null;
  courseRef?: Course | null;
  timetable?: { id: string; branch: string; semester: number; section: string | null };
}

export interface CampusTimetable {
  id: string;
  branch: string;
  semester: number;
  section: string | null;
  extractionId: string | null;
  extraction?: { id: string; documentId: string } | null;
  createdAt: string;
  slots: CampusSlot[];
}

export interface ExtraClass {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  facultyId: string;
  courseId: string | null;
  roomId: string | null;
  faculty?: Faculty;
  course?: Course | null;
  room?: Room | null;
}

export interface TodayPayload {
  day: number;
  weekday: string;
  faculty: Faculty | null;
  slots: CampusSlot[];
  extraClasses: ExtraClass[];
  dueAssignments: { id: string; title: string; dueAt: string }[];
  invigilations: InvigilationDuty[];
}

export interface InvigilationDuty {
  id: string;
  date: string;
  period: number;
  notes: string | null;
  faculty?: Faculty;
  room?: Room | null;
}

export interface RubricItem {
  id: string;
  criterion: string;
  maxMarks: number;
}

export interface Student {
  id: string;
  name: string;
  section: string;
  rollNo: string;
  userId?: string | null;
  createdAt: string;
  user?: { id: string; email: string; role: Role } | null;
  parentLinks?: { id: string; parentUserId: string; parent: { id: string; email: string; name: string; role: Role } }[];
}

export interface Assignment {
  id: string;
  title: string;
  rubric: RubricItem[];
  dueAt: string | null;
  questionPaperId: string | null;
  createdAt: string;
  questionPaper?: { id: string; title: string; totalMarks: number; status: string; documentId?: string } | null;
  _count?: { submissions: number };
}

export interface GradeRecord {
  id: string;
  submissionId: string;
  aiScores: { id: string; criterion: string; maxMarks: number; score: number; comment?: string }[];
  finalScores: { id: string; criterion: string; maxMarks: number; score: number; comment?: string }[];
  total: number;
  feedback: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
}

export interface Submission {
  id: string;
  status: "UPLOADED" | "GRADING" | "GRADED" | "REVIEWED";
  assignmentId: string;
  studentId: string;
  documentId: string;
  createdAt: string;
  student?: Student;
  assignment?: { id: string; title: string };
  document?: { id: string; title: string; status: string };
  grade?: GradeRecord | null;
}

export interface AssignmentAnalytics {
  assignmentId: string;
  title: string;
  submissionCount: number;
  gradedCount: number;
  mean: number;
  median: number;
  perCriterion: { id: string; criterion: string; maxMarks: number; avg: number }[];
}

