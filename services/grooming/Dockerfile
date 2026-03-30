FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/grooming/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/grooming/Dockerfile .
WORKDIR /app/services/grooming

COPY services/grooming/package.json ./
RUN npm install --omit=dev

COPY services/grooming/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
