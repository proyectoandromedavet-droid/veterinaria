FROM node:20-alpine
WORKDIR /app

COPY services/telemedicine/package.json ./
RUN npm install --omit=dev

# Shared modules (build context must be the monorepo root)
COPY shared ./shared

COPY services/telemedicine/src ./src

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
