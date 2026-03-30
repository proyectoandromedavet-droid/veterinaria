FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../shared from gateway/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f gateway/Dockerfile .
WORKDIR /app/gateway

COPY gateway/package.json gateway/package-lock.json ./
RUN npm install --omit=dev

COPY gateway/src ./src
COPY shared /app/shared

RUN mkdir -p /app/gateway/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
