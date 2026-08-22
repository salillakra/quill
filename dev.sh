#!/usr/bin/env bash
set -e

echo "🚀 Starting Quill — AI Document Intelligence Platform"
echo "--------------------------------------------------------"


if docker compose ps | grep -q "Up"; then
  echo "✅ Docker services (Postgres & Redis) are running."
else
  echo "📦 Starting Docker services (Postgres + Redis)..."
  docker compose up -d
fi

# Run root concurrently dev launcher
echo "🔥 Launching Backend (Hono/Bun) on :3001 and Frontend (Next.js) on :3000..."
npx concurrently -k -n "API,UI" -c "cyan,magenta" "cd backend && bun run dev" "cd frontend && pnpm dev"
