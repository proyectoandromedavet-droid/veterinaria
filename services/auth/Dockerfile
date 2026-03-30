FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/auth/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/auth/Dockerfile .
WORKDIR /app/services/auth

COPY services/auth/package.json ./
RUN npm install --omit=dev

COPY services/auth/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
