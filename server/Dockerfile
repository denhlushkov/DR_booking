# Контекст збірки — корінь репозиторію (npm workspaces, спільний package-lock.json).

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY e2e/package.json e2e/
RUN npm ci -w server --include-workspace-root
COPY server/tsconfig*.json server/
COPY server/src server/src
RUN npm run build -w server

# ---------- runtime ----------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY e2e/package.json e2e/
RUN npm ci -w server --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/db server/db
WORKDIR /app/server
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
