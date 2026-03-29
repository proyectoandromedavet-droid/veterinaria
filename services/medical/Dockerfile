FROM node:20-alpine
WORKDIR /app

COPY services/medical/package.json ./
RUN npm install --omit=dev

# Shared modules (build context must be the monorepo root)
COPY shared ./shared

COPY services/medical/src ./src

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
