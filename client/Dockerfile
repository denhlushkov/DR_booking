# Контекст збірки — корінь репозиторію (npm workspaces, спільний package-lock.json).

# ---------- build ----------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY e2e/package.json e2e/
RUN npm ci -w client --include-workspace-root
COPY client/ client/
RUN npm run build -w client

# ---------- runtime: Nginx (HTTPS, статика SPA, reverse proxy на API) ----------
FROM nginx:1.29-alpine
RUN apk add --no-cache openssl
COPY client/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 client/nginx/15-self-signed-cert.sh /docker-entrypoint.d/15-self-signed-cert.sh
COPY --from=build /app/client/dist /usr/share/nginx/html
ENV PUBLIC_HTTPS_PORT=443
EXPOSE 80 443
