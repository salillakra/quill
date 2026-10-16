#!/usr/bin/env bash
set -e

echo "🚀 Starting Quill — AI Document Intelligence Platform"
echo "--------------------------------------------------------"

echo "📦 Ensuring Docker services (Postgres + Redis) are up..."
docker compose up -d

echo "⏳ Waiting for Redis to be ready..."
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 1
done
echo "✅ Redis is ready."

# Run root concurrently dev launcher
echo "🔥 Launching Backend (Hono/Bun) on :3001 and Frontend (Next.js) on :3000..."
npx concurrently -k -n "API,UI" -c "cyan,magenta" "cd backend && bun run dev" "cd frontend && pnpm dev"
