# Construit depuis la racine du dépôt :
#   docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/editor-schema/package.json packages/editor-schema/
# « ... » : l'API et les paquets du monorepo dont elle dépend.
RUN pnpm install --frozen-lockfile --filter "@plumiotheca/api..."
COPY packages/contracts packages/contracts
COPY packages/editor-schema packages/editor-schema
COPY apps/api apps/api
# « files » de package.json : deploy n'emporte que dist/ et les dépendances de production.
RUN pnpm --filter "@plumiotheca/api..." build \
 && pnpm --filter @plumiotheca/api deploy --prod --legacy /out

FROM node:24-alpine
# Gestionnaires de paquets inutiles à l'exécution : moins de surface d'attaque.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg
# TRUST_PROXY et CORS_ORIGINS sont à fournir au lancement (obligatoires en production).
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
