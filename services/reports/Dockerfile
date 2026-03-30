FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/reports/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/reports/Dockerfile .
WORKDIR /app/services/reports

COPY services/reports/package.json ./
RUN npm install --omit=dev

COPY services/reports/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
