# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# Same pnpm as CI and the lockfile author. kaja pinned 10.12.1 to dodge pnpm
# 11's verify-deps-before-run in non-TTY; this image never invokes pnpm at
# runtime (the CMD runs node directly), so that failure mode cannot occur —
# and pnpm 11 is the version that reads `allowBuilds` from pnpm-workspace.yaml.
RUN npm install -g pnpm@11.24.0 && pnpm --version
WORKDIR /app
ENV CI=true

FROM base AS deps
# .npmrc is deliberately left out: it points pnpm's store at a local .tmp path
# for this sandbox, which has no business inside the image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
# The card is rendered as an image server-side, and librsvg finds fonts through
# fontconfig. Alpine ships neither, so both are installed explicitly and pointed at
# the vendored Noto files (src/lib/fonts.ts writes the config at first render).
RUN apk add --no-cache fontconfig
# lockfile must be present before `pnpm prune` reads the manifest
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
# keep only production deps; confirmModulesPurge=false skips the
# interactive prompt (build must be non-TTY)
RUN pnpm prune --prod --config.confirmModulesPurge=false
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
# Brand assets and the vendored fonts: the card cannot be drawn without them.
COPY --from=builder /app/assets ./assets
# Astro's standalone server reads HOST and PORT from the environment.
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
# Launched directly, not through pnpm: the runtime needs no package manager,
# which removes the pnpm-version failure mode from the container.
CMD ["sh", "-c", "node scripts/migrate-on-start.mjs && node ./dist/server/entry.mjs"]
