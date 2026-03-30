FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/billing/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/billing/Dockerfile .
WORKDIR /app/services/billing

COPY services/billing/package.json ./
RUN npm install --omit=dev

COPY services/billing/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
