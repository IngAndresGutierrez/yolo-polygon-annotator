# syntax=docker/dockerfile:1

# ---- deps: exact versions from package-lock.json ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: type-check and bundle ----
FROM deps AS build
COPY frontend/ ./
RUN npm run build

# ---- runtime: static files + /api reverse proxy, non-root nginx ----
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
