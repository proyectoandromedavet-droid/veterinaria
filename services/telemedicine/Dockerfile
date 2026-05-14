FROM node:20-alpine

# Install from the root package.json — it contains all dependencies needed
# by both the service and the shared/ modules.
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY services/telemedicine/src ./services/telemedicine/src
COPY shared ./shared

EXPOSE 3000
USER node
CMD ["node", "services/telemedicine/src/index.js"]
