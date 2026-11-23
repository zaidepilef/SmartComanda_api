# =========================================
# Multi-stage Dockerfile
#   dev        → local development (docker-compose: target: dev)
#   production → Dokploy / VPS (last stage, built by default)
# =========================================

# =========================================
# Base: shared by every stage
# =========================================
FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./

# =========================================
# Dev: all dependencies + auto-reload
# The source code is mounted as a volume by docker-compose.
# =========================================
FROM base AS dev

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# =========================================
# Production: runtime dependencies only, non-root user
# =========================================
FROM base AS production

ENV NODE_ENV=production

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
