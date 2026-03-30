FROM node:20-alpine

# node_modules must live at /app so Node's resolution algorithm can find
# packages from both /app/gateway/src/ and /app/shared/ (which walk up to /app).
WORKDIR /app

COPY gateway/package.json gateway/package-lock.json ./
RUN npm install --omit=dev

# Maintain the monorepo structure inside the container:
#   /app/gateway/src/index.js  →  ../../shared  →  /app/shared  ✓
#   /app/shared/cache.js       →  require('redis')  →  /app/node_modules  ✓
COPY gateway/src ./gateway/src
COPY shared ./shared

RUN mkdir -p /app/gateway/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "gateway/src/index.js"]
