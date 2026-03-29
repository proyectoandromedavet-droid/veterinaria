FROM node:20-alpine
WORKDIR /app

COPY shared ./shared

COPY gateway/package.json gateway/package-lock.json ./
RUN npm install --omit=dev

COPY gateway/src ./src

RUN mkdir -p /app/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]