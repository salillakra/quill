# Quill

Campus operations and assessment in one workspace — built on a shared document engine.

Upload a syllabus, timetable, or notes PDF. Quill reads it, then you can ask it with citations, pull a timetable into campus, turn it into a question paper, and mark student scripts.

**MIT licensed** · [Salil Lakra](https://github.com/salillakra)

---

## What it does

| Area | What you get |
|---|---|
| **Library** | Upload PDF, image, or text. Ingest runs convert → OCR → chunk → embed. Ask with page-cited answers. Staff can extract a timetable or create a paper. |
| **Campus** | Today’s classes and extras, timetable editor, faculty / rooms / courses, extra classes, greedy timetable generate, invigilation duties. |
| **Papers & marking** | Generate and edit papers, assignments with rubrics, script upload, AI grade + teacher override, class analytics. |
| **Student** | See assignments and submit a script. |
| **Parent** | See released grades for linked students. |

Roles: `ADMIN`, `EDUCATOR`, `ANALYST`, `STUDENT`, `PARENT`. Educators can link to a `Faculty` row for Today. Students link to a `Student` row. Parents see grades through `ParentLink`. Users belong to a `Workspace` (seed workspace: `demo`).

Internal pipeline screens (`/jobs`, `/analytics`) are not part of the product navigation.

---

## How it works

```
Browser (Next.js 16) ──REST + Socket.IO──► API (Bun + Hono)
                                              │
                         BullMQ (Redis)       │  Prisma → PostgreSQL
                         ingest / extract     │  Pinecone (768-d cosine)
                         generate / grade     │  Gemini (or demo mode)
```

1. **Ingest** — file → pages → OCR → chunks → Gemini embeddings → Pinecone (`doc-{documentId}`).
2. **Extract** — Gemini (text + first page) → Zod JSON → timetable slots, resolving faculty / room / course when names match.
3. **Generate** — Gemini paper JSON → Playwright HTML/PDF.
4. **Ask** — embed question → Pinecone + lexical ILIKE → RRF → rerank → grounded answer + sources.
5. **Grade** — wait for OCR on the script → rubric JSON scores → teacher can override and release.

Without `GEMINI_API_KEY` the app still runs. Extraction, generation, embeddings, and grading use deterministic demo fallbacks. Logs and responses mark `demo: true`. OCR, chunking, queues, database, and UI stay real.

---

## Stack

| | |
|---|---|
| API | Bun, Hono 4, Prisma 6, Zod 4, jose JWT (httpOnly cookie), argon2 via `Bun.password` |
| Workers | BullMQ 5 + Redis 7, in-process (optional separate `bun run worker`) |
| AI / search | Gemini 3.5 Flash + `gemini-embedding-001`, Pinecone serverless, tesseract.js, poppler `pdftoppm`, Playwright |
| App | Next.js 16, React 19, Tailwind v4, shadcn/ui (Base UI), TanStack Query, Socket.IO, Recharts |
| Infra | Docker Compose: PostgreSQL 16 + Redis 7 |

---

## Repository

```
quill/
├── docker-compose.yml
├── dev.sh                    # compose + API :3001 + UI :3000
├── backend/                  # Hono app, workers, Prisma, prompts, tests
│   ├── prisma/schema.prisma
│   ├── prisma/seed.ts
│   └── src/{routes,services,workers,queues}
└── frontend/                 # Next.js App Router
    └── app/{documents,campus,assessment,papers,student,parent,login}
```

---

## Getting started

**Need:** Bun ≥ 1.2, Node ≥ 20, pnpm ≥ 9, Docker. A **Pinecone** API key is required (index `quill` is created at boot). **Gemini** is optional.

```bash
# 1. Infra
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # DATABASE_URL, REDIS_URL, PINECONE_API_KEY; optional GEMINI_API_KEY
bun install
bunx prisma migrate dev       # or: bunx prisma db push
bun run db:seed
cd ..

# 3. Frontend
cd frontend
pnpm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:3001
cd ..

# 4. Run both
./dev.sh                      # or: bun run dev  from the repo root
```

UI: [http://localhost:3000](http://localhost:3000) · API: [http://localhost:3001](http://localhost:3001)

Sample syllabus: `cd backend && bun run scripts/sample-pdf.ts`, then upload `scripts/samples/syllabus.pdf`.

### Demo accounts

Password for all: `quill123`

| Email | Role | Lands on |
|---|---|---|
| `admin@quill.ai` | Admin | Library |
| `educator@quill.ai` | Educator (no faculty link) | Library |
| `faculty@quill.ai` | Educator (Priya Rao) | Today |
| `analyst@quill.ai` | Analyst | Library |
| `student@quill.ai` | Student (Aanya Sharma) | My assignments |
| `parent@quill.ai` | Parent (Aanya) | Grades |

---

## Configuration

See `backend/.env.example`. Important keys:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres from Compose: `postgresql://quill:quill@localhost:5432/quill` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | Change before any shared deploy |
| `PINECONE_API_KEY` | Required |
| `GEMINI_API_KEY` | Empty → demo mode |
| `FRONTEND_URL` | CORS, default `http://localhost:3000` |

---

## Testing and CI

```bash
cd backend && bun test && bun run typecheck
cd frontend && pnpm typecheck
# from repo root:
bun test
```

`.github/workflows/ci.yml` runs Prisma generate, backend tests + typecheck, and frontend typecheck on push and PR.

---

## Deploy

- **Frontend** — Vercel, root `frontend`, point `NEXT_PUBLIC_*` at the API.
- **Backend** — container host; managed Postgres + Redis + Pinecone. Workers stay in-process until queue depth needs `bun run worker` as its own process.
- Do not expose `/metrics` on the public internet without an ACL. Cookie auth is same-origin only if the API and UI share a host, or you terminate both behind one origin.

---

## Future scope

Grounded in the current schema and routes — not a wishlist. Detail lives in [docs/ISSUES_AND_SCOPE.md](docs/ISSUES_AND_SCOPE.md).

**Tenancy** — Unique codes and emails per workspace. `workspaceId` on timetables, jobs, papers, and analytics. Shared library vs personal uploads.

**Auth** — One origin (rewrite `/api` to the backend, or a BFF that sets the session cookie on the UI host). Drop any client-readable “authed” flag.

**Product** — Parent/student linking in the Students UI. Offerings editor for timetable generate. Hide assessment mutations from Analyst. Socket events on grade jobs. Students see scores only after release.

**Campus** — Constraint solver (capacity, load, pinned slots) instead of greedy fill. Exam-session invigilation, not “periods 1–2 × all rooms”.

**Pipeline** — Incremental OCR. Hybrid sparse + dense retrieval. Per-user job history. Histograms and auth on `/metrics`. Rate limits on extract / generate / grade. Signup, invites, password change.

**Not planned unless asked** — Billing, white-label, mobile apps, multi-region indexes.

---

## Contributing

Issues and PRs are welcome. Prefer a small, reviewable change over a sweep.

1. Fork and branch from `main` (`feat/…`, `fix/…`).
2. Keep API and UI in TypeScript. New env vars go in `.env.example` and Zod config.
3. Add or update a `bun:test` case for non-trivial backend logic (chunker, validators, integration).
4. Do not commit `.env`, credentials, or uploaded files.
5. Run `bun test` (root) before you open the PR.
6. Describe *why* in the PR, and how you tried it (role + path).

Code style: match the file you are in. No extra markdown files unless the change needs them.

---

## License

[MIT](LICENSE) © 2026 Salil Lakra
