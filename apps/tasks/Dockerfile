FROM node:22-bookworm-slim AS dependencies

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/tasks/package.json apps/tasks/package.json
COPY packages/financial-state/package.json packages/financial-state/package.json
COPY packages/tasks-api/package.json packages/tasks-api/package.json
COPY packages/tasks-contracts/package.json packages/tasks-contracts/package.json
COPY packages/tasks-runtime/package.json packages/tasks-runtime/package.json

RUN npm ci

FROM node:22-bookworm-slim AS builder

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/packages ./packages
COPY . .

RUN npm run build:tasks

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /runtime

COPY --from=builder --chown=nextjs:nodejs /workspace/apps/tasks/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/tasks/.next/static ./apps/tasks/.next/static

USER nextjs
WORKDIR /runtime/apps/tasks

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
