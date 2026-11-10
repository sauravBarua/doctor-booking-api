# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-slim AS base
# Match `pnpm --version` on your machine. Not needed if package.json has a "packageManager" field.
ARG PNPM_VERSION=10
ENV PNPM_HOME=/pnpm \
    npm_config_store_dir=/pnpm/store \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=true
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# prisma/ and prisma.config.ts come first in case a postinstall script runs `prisma generate`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Prisma 7 evaluates prisma.config.ts, which wants a DATABASE_URL even to generate. Build-time dummy only.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate \
 && pnpm build

# One-off job: applies migrations, then exits.
FROM build AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS prod-deps
RUN pnpm prune --prod --ignore-scripts

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# The worker uses the same image: node dist/worker/main.js
CMD ["node", "dist/main.js"]