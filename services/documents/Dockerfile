FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY services/documents/src ./services/documents/src
COPY shared ./shared

EXPOSE 3000
USER node
CMD ["node", "services/documents/src/index.js"]
