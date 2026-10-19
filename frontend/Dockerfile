# syntax=docker/dockerfile:1
# Multi-stage build for the HFAIO frontend: build the Vite/React app with Node,
# then serve the static files with an unprivileged nginx image.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The app calls the API through the same origin; nginx proxies /api to the backend.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- serve ----------
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime

# Pull in Alpine security fixes newer than the base image (Trivy gate in CI).
USER root
RUN apk upgrade --no-cache

# Rendered at container start by the nginx entrypoint (envsubst on templates).
ENV BACKEND_URL=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html

USER 101
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
