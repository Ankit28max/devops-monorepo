FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/db ./packages/db
COPY apps/ws ./apps/ws

RUN bun install --frozen-lockfile
RUN cd packages/db && bunx prisma generate

EXPOSE 8081
CMD ["bun", "run", "apps/ws/src/index.ts"]
