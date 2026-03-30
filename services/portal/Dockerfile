FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/portal/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/portal/Dockerfile .
WORKDIR /app/services/portal

COPY services/portal/package.json ./
RUN npm install --omit=dev

COPY services/portal/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
