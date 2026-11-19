# Imágenes base fijadas por digest (RNF-09). Se actualizan por PR (Renovate).
ARG NODE_IMAGE=node:24-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0
ARG CADDY_IMAGE=caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
# La versión del tag debe ser igual a la de @playwright/test (lo verifica scripts/check-playwright-version.mjs).
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579
ARG PNPM_VERSION=12.21.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
ENV CI=true
WORKDIR /repo

# ---- dependencias (capa cacheable: solo manifiestos y lockfile) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- desarrollo: el código se monta como volumen desde compose.yml ----
FROM deps AS dev
COPY . .

# ---- build de producción ----
FROM dev AS build
RUN pnpm --filter @inventarius/shared build \
 && pnpm --filter @inventarius/api build \
 && pnpm --filter @inventarius/web build \
 && pnpm --filter @inventarius/api deploy --prod --legacy /out/api

# ---- runtime API + worker + migraciones (mismo código, distinto comando) ----
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
# La imagen base está fijada por digest y puede quedar atrás de parches de seguridad de Debian (p. ej. zlib).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
# El runtime no necesita npm/npx/corepack: se quitan para reducir superficie (y sus dependencias vendorizadas en Trivy).
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

# ---- runtime web: Caddy sirve la SPA y proxya /api ----
FROM ${CADDY_IMAGE} AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 8080

# ---- e2e: imagen oficial de Playwright con la versión fijada ----
FROM ${PLAYWRIGHT_IMAGE} AS e2e
ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
ENV CI=true
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY e2e/package.json e2e/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @inventarius/e2e
COPY e2e e2e
WORKDIR /repo/e2e
CMD ["pnpm", "exec", "playwright", "test"]
