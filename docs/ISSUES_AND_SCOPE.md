# Issues and further update scope

This document is the leftover after Wave 1–3. Wave 1 finished existing journeys. Wave 2–3 are on disk as working slices, not commercial clones. Every item below is grounded in a file or schema constraint, not a vibe.

Restart `./dev.sh` after pull. Schema was pushed; seed now includes `student@quill.ai` and `parent@quill.ai` (password `quill123`).

---

## What shipped (so you do not re-plan it)

### Wave 2

| Item | Where it lives |
|---|---|
| Contextual Ask (timetable / paper / assignment source `documentId`) | `frontend/components/contextual-ask.tsx`; buttons on `frontend/app/campus/timetable/page.tsx`, `frontend/app/papers/page.tsx`, `frontend/app/assessment/assignments/[id]/page.tsx` |
| Re-ingest | `POST /api/documents/:id/reingest` in `backend/src/routes/documents.route.ts`; button on `frontend/app/documents/[id]/page.tsx` |
| CSV export | `GET /api/campus/timetables/:id/export.csv`; `GET /api/assessment/assignments/:id/analytics.csv` |
| Today due dates + invigilation | `GET /api/campus/today` adds `dueAssignments` (due in 7 days) and `invigilations`; `frontend/app/campus/today/page.tsx` |
| Job retry from document DAG | `PipelineDag` `onRetry` → existing `POST /api/jobs/:id/retry` |
| Rate limit login + ask | Redis `INCR` in `backend/src/middleware/rate-limit.ts`: login 10 / 15 min / IP; ask 30 / min / user |
| SSR/middleware auth (flash) | `frontend/middleware.ts` + `quill_authed` flag cookie in `frontend/lib/roles.ts`. API JWT stays on `:3001`. |

### Wave 3

| Item | What it actually is |
|---|---|
| Workspace | `Workspace` model + `workspaceId` on users and campus/assessment rows. Boot `ensureDemoWorkspace()` (`backend/src/services/workspace.service.ts`) backfills slug `demo`. List/create filters by `user.workspaceId`. |
| Student login + self-submit | Role `STUDENT`. Seed `student@quill.ai` linked to Aanya Sharma (`Student.userId`). Pages `/student/assignments`. Submit forces that roster id (`assessment.route.ts`). |
| Parent portal | Role `PARENT`. `ParentLink`. Seed `parent@quill.ai` → Aanya. `GET /api/assessment/parent/grades`. Page `/parent/grades`. |
| Timetable generate | Greedy 5×8 fill, no CP-SAT. `POST /api/campus/timetables/generate`. `Timetable.extractionId` is now optional. |
| Invigilation | Least-loaded faculty free that period. `POST /api/campus/invigilations`. |
| Incremental Pinecone | `embedChunks` hashes content per index; skips unchanged; `deleteMany` removed ids. No namespace wipe on re-embed (`pinecone.service.ts`, `embedder.service.ts`). |
| Prometheus | `GET /metrics` and `GET /api/metrics` text exposition (`backend/src/services/metrics.service.ts`). Gauges/counts, not histograms. |

---

## Known issues (current code)

1. **Auth flag is not the JWT.** `quill_authed=1` is readable JS on `:3000`. Anyone can set it and pass middleware; the API still 401s. Cold `/documents` no longer flashes, but this is not same-origin session security. Proof: cookie is set in `setAuthFlag()` (`frontend/lib/roles.ts`), not by `Set-Cookie` from Hono (`COOKIE_NAME = quill_session` on `:3001`).

2. **Workspace uniqueness is still global.** `Faculty.email`, `Room.code`, `Course.code`, `Student @@unique([section, rollNo])` are not `@@unique([workspaceId, …])`. A second workspace cannot reuse `CS201` / `LH-1`. Proof: `backend/prisma/schema.prisma`.

3. **Timetable rows are not workspace-scoped.** `Timetable` has no `workspaceId`. Generate writes into the global table. Extraction-backed grids from another tenant’s document would still list. Proof: `model Timetable` vs `Faculty.workspaceId`.

4. **Documents stay per-uploader.** `GET /api/documents` is `where: { userId }`. Contextual Ask of an admin-uploaded timetable works because ask routes do not check owner (`rag.route.ts`). Opening that document in the library 404s for another user (`documents.route.ts` `findFirst` + `userId`).

5. **Solver is greedy, not a constraint solver.** First free (day, period) wins. No labs-vs-lectures, no lunch, no max consecutive hours, no even spread. Unplaced offerings are returned, not repaired. Proof: `backend/src/services/timetable-solver.service.ts` (`DAYS = 5`, `PERIODS = 8`).

6. **Generate UI assigns every course to the first faculty / first room, 3 periods.** The API accepts a full `offerings[]`; the dialog does not. Proof: `frontend/app/campus/timetable/page.tsx` `generate` mutation.

7. **Invigilation is periods 1–2 × all rooms.** No exam paper, no duration, no seating. Duties are extra rows, not exam sessions.

8. **Parent cannot be linked in the UI.** `ParentLink` is seed-only. Faculty user linking exists; parent linking does not.

9. **Student cannot change password / signup.** Same as staff: seed + login.

10. **Rate limits are per-process Redis keys, not WAF.** Shared with BullMQ on the same `ioredis` client (`maxRetriesPerRequest: null`). Fine locally; not a substitute for edge limits.

11. **`/metrics` is unauthenticated.** Intended for a private scrape. Do not expose it on the public internet without a collector ACL.

12. **CSV download is a top-level navigation to `:3001`.** Relies on the API cookie being sent to that host. It will not work if the API is on another site without cookie `Domain`.

13. **Re-ingest re-runs convert+OCR+chunk+embed.** Incremental vectors only skip unchanged *chunk text*. OCR is not incremental. Failed ingest leaves `PROCESSING` until retry.

14. **ANALYST can still mutate assessment** (create assignment, override grades). Wave 1 only froze campus/students mutations via `canMutateCampus`.

15. **Jobs list is still global**, not per-user or per-workspace (`jobs.route.ts` `findMany` take 50).

16. **No Socket.IO on grade jobs** was already true; Wave 2/3 did not add it. Grading queue polls 4s.

17. **Prisma `db push` warned** about `Student.userId` unique. Existing duplicates would fail; current seed has one link (Aanya).

---

## Further update scope (recommended order)

### P0 — make Wave 3 tenancy real

- `@@unique([workspaceId, code])` (and email / section+rollNo) after backfill.
- `workspaceId` on `Timetable`, `Job` list, papers list, analytics.
- Workspace switcher + create-workspace for ADMIN (second tenant to prove isolation).
- Document visibility: workspace-shared library vs personal uploads.

### P0 — auth that matches the architecture

- Next.js rewrite `/api` → backend **or** BFF that copies `Set-Cookie` onto `:3000`, then delete `quill_authed`.
- Or terminate TLS on one origin.

### P1 — product holes people will hit in a demo

- Parent-link dropdown on Students (mirror Faculty `userId` UI).
- Student link dropdown on Students.
- Offerings editor for timetable generate (pick faculty/room/periods per course).
- Assignment due date on create was already there; show overdue styling on Today.
- Hide assessment mutations from ANALYST (parity with campus).
- Grade worker socket events (same pattern as ingest).

### P1 — assessment completeness

- Per-assignment grading filter (`?assignment=`).
- Student sees only REVIEWED feedback (today they see AI totals as soon as GRADED).
- Duplicate submission policy (overwrite vs version).

### P2 — solver / campus ops (still not Anugat)

- Replace greedy with a real model (OR-Tools CP-SAT or ILP): room capacity, faculty max load, pinned slots.
- Invigilation: exam session entity, duration, one faculty per room, consecutive-duty caps.
- Requests workflow (room change / extra class approval) — README originally cut this.

### P2 — retrieval / pipeline

- Incremental OCR (page-level hash) so re-ingest does not re-tesseract unchanged pages.
- Pinecone sparse+dense hybrid (now dense + Postgres lexical fallback only).
- Per-user job explorer.

### P2 — ops

- Prometheus histograms for stage `durationMs` (data already on `Job.stages`).
- Auth on `/metrics` (bearer or IP allowlist).
- Rate limit extract/generate/grade too.
- Signup / password change / invite.

### Explicitly not next unless pulled

- White-label / dean workload optimizer.
- Multi-region Pinecone.
- Mobile apps.
- Billing.

---

## New / changed API surface (Wave 2–3)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/users` | ADMIN (Wave 1) |
| POST | `/api/documents/:id/reingest` | New ingest job on existing file |
| GET | `/api/campus/timetables/:id/export.csv` | Grid CSV |
| POST | `/api/campus/timetables/generate` | Greedy generate; `extractionId` null |
| GET | `/api/campus/invigilations` | List duties |
| POST | `/api/campus/invigilations` | `{ date, periods, roomIds? }` |
| GET | `/api/assessment/assignments/:id/analytics.csv` | Per-student scores |
| GET | `/api/assessment/parent/grades` | PARENT (or ADMIN) |
| DELETE | `/api/assessment/students/:id` | Wave 1 |
| GET | `/metrics` | Prometheus text, no auth |
| GET | `/api/metrics` | Same body |

Login/me now include `facultyId`, `studentId`, `workspaceId`.

---

## Demo accounts (after seed)

All password `quill123`:

| Email | Role | Landing |
|---|---|---|
| `admin@quill.ai` | ADMIN | `/documents` |
| `educator@quill.ai` | EDUCATOR, no Faculty | `/documents` + banner |
| `faculty@quill.ai` | EDUCATOR, Priya Rao | `/campus/today` |
| `analyst@quill.ai` | ANALYST | `/analytics` |
| `student@quill.ai` | STUDENT, Aanya Sharma | `/student/assignments` |
| `parent@quill.ai` | PARENT → Aanya | `/parent/grades` |
