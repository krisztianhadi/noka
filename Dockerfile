# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# Pin pnpm deterministically — corepack can resolve "latest" (11.x), and
# pnpm 11's verify-deps-before-run re-runs install at startup and fails on
# unapproved build scripts in non-TTY. Node 22 ships npm, so install the
# pinned version directly (proven in kaja and Ghosted).
RUN npm install -g pnpm@10.12.1 && pnpm --version
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
# lockfile must be present before `pnpm prune` reads the manifest
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/.npmrc ./.npmrc
COPY --from=builder /app/node_modules ./node_modules
# keep only production deps; confirmModulesPurge=false skips the
# interactive prompt (build must be non-TTY)
RUN pnpm prune --prod --config.confirmModulesPurge=false
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
# Astro's standalone server reads HOST and PORT from the environment.
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
# Launched directly, not through pnpm: the runtime needs no package manager,
# which removes the pnpm-version failure mode from the container.
CMD ["sh", "-c", "node scripts/migrate-on-start.mjs && node ./dist/server/entry.mjs"]
