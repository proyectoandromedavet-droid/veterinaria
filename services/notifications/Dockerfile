FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/notifications/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/notifications/Dockerfile .
WORKDIR /app/services/notifications

COPY services/notifications/package.json ./
RUN npm install --omit=dev

COPY services/notifications/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
