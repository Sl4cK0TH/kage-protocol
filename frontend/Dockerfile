# --- Dependencies -------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ----------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they must be passed as build args (see docker-compose.yml), not runtime env.
# NEXT_PUBLIC_API_BASE is the backend URL as reached from the admin's browser.
ARG NEXT_PUBLIC_API_BASE=http://localhost:8081
ARG NEXT_PUBLIC_SESSION_COOKIE_NAME=kage_session
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_PUBLIC_SESSION_COOKIE_NAME=$NEXT_PUBLIC_SESSION_COOKIE_NAME \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runtime --------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output: a minimal server.js plus only the dependencies it needs.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Run as the image's unprivileged "node" user.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
