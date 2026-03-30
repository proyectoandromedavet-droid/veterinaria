FROM node:20-alpine

# Install from the root package.json — it contains all dependencies needed
# by both the service and the shared/ modules.
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY services/ai/src ./services/ai/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/ai/src/index.js"]
