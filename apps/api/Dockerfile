# Construit depuis la racine du dépôt :
#   docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
# « ... » : l'API et les paquets du monorepo dont elle dépend.
RUN pnpm install --frozen-lockfile --filter "@plumiotheca/api..."
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter "@plumiotheca/api..." build \
 && pnpm --filter @plumiotheca/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
