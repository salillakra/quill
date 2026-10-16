FROM oven/bun:1.3-alpine

WORKDIR /app

# poppler for pdftoppm (PDF → images)
RUN apk add --no-cache poppler-utils

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY prisma ./prisma
RUN bunx prisma generate

COPY src ./src

RUN bunx playwright install --with-deps chromium-headless-shell || bunx playwright install chromium

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
