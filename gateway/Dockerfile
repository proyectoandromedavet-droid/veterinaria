FROM node:20-alpine

# Install from the root package.json — it contains all dependencies needed
# by both the gateway and the shared/ modules (redis, prom-client, etc.).
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Maintain the monorepo structure so relative imports resolve correctly:
#   /app/gateway/src/index.js  →  ../../shared  →  /app/shared  ✓
#   /app/shared/*.js           →  require('redis')  →  /app/node_modules  ✓
COPY gateway/src ./gateway/src
COPY shared ./shared

RUN mkdir -p /app/gateway/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "gateway/src/index.js"]
