# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY andromeda-front/package.json andromeda-front/package-lock.json ./
RUN npm ci
COPY andromeda-front/ .
# Sin VITE_API_URL → baseURL queda relativo (/api/v1) — funciona con el mismo origen
RUN npm run build

# ── Stage 2: backend + frontend dist ─────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN npm install -g pm2

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY shared ./shared
COPY gateway ./gateway
COPY services ./services
COPY plugins ./plugins
COPY ecosystem.railway.config.js ./

# Copia el dist del frontend para que el gateway lo sirva
COPY --from=frontend-build /app/frontend/dist ./andromeda-front/dist

RUN mkdir -p /app/logs/pm2 && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["pm2-runtime", "start", "ecosystem.railway.config.js"]
