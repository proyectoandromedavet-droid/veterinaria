FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/patients/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/patients/Dockerfile .
WORKDIR /app/services/patients

COPY services/patients/package.json ./
RUN npm install --omit=dev

COPY services/patients/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
