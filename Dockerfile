# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Menjalankan migrasi database sekali sebelum app start
FROM deps AS migrate
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY src/db ./src/db
COPY src/lib/id.ts ./src/lib/id.ts
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
