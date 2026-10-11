# Site Plumiotheca : fichiers compilés par Vite, servis par nginx sans droits root.
# Construit depuis la racine du dépôt :
#   docker build -f apps/web/Dockerfile -t plumiotheca-web .
# Une même image pour tous les environnements : adresses de Keycloak et de l'API fournies
# au lancement (variables ci-dessous), jamais compilées dans les fichiers.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/editor-schema/package.json packages/editor-schema/
# « ... » : le site et les paquets du monorepo dont il dépend.
RUN pnpm install --frozen-lockfile --filter "@plumiotheca/web..."
COPY packages/contracts packages/contracts
COPY packages/editor-schema packages/editor-schema
COPY apps/web apps/web
# La charte affichée à l'accueil vient de docs/ (source unique).
COPY docs/charte.md docs/charte.md
RUN pnpm --filter @plumiotheca/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# Valeurs par défaut : développement local. En production, au lancement :
#   OIDC_AUTHORITY=https://compte.exemple/realms/plumiotheca
#   KEYCLOAK_ORIGIN=https://compte.exemple   (CSP : connexion et renouvellement des jetons)
#   API_URL=https://api.exemple/api           API_ORIGIN=https://api.exemple
#   HSTS="max-age=31536000; includeSubDomains" (derrière HTTPS seulement)
ENV OIDC_AUTHORITY=http://localhost:8080/realms/plumiotheca \
    OIDC_CLIENT_ID=web \
    KEYCLOAK_ORIGIN=http://localhost:8080 \
    API_URL=/api \
    API_ORIGIN= \
    HSTS=max-age=0
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
