FROM node:20-alpine

# WORKDIR mirrors the monorepo structure so that relative imports
# (../../../shared from services/telemedicine/src/) resolve to /app/shared at runtime.
# Build context must be the monorepo root:
#   docker build -f services/telemedicine/Dockerfile .
WORKDIR /app/services/telemedicine

COPY services/telemedicine/package.json ./
RUN npm install --omit=dev

COPY services/telemedicine/src ./src
COPY shared /app/shared

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
