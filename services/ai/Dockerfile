FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/ai/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/ai/Dockerfile .
WORKDIR /app/services/ai

COPY services/ai/package.json ./
RUN npm install --omit=dev

COPY services/ai/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
