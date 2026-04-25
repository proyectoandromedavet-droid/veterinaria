FROM node:20-alpine
WORKDIR /app

COPY shared ./shared

COPY gateway/package.json gateway/package-lock.json ./gateway/
RUN cd gateway && npm install --omit=dev

COPY gateway/src ./gateway/src

RUN mkdir -p /app/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "gateway/src/index.js"]