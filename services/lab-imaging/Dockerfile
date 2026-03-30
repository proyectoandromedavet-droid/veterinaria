FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/lab-imaging/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/lab-imaging/Dockerfile .
WORKDIR /app/services/lab-imaging

COPY services/lab-imaging/package.json ./
RUN npm install --omit=dev

COPY services/lab-imaging/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
