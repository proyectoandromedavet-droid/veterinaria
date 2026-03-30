FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/medical/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/medical/Dockerfile .
WORKDIR /app/services/medical

COPY services/medical/package.json ./
RUN npm install --omit=dev

COPY services/medical/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
