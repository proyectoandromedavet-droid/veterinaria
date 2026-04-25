FROM node:20-alpine
WORKDIR /app

RUN npm install -g pm2

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY shared ./shared
COPY gateway ./gateway
COPY services ./services
COPY plugins ./plugins
COPY ecosystem.railway.config.js ./

RUN mkdir -p /app/logs/pm2 && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["pm2-runtime", "start", "ecosystem.railway.config.js"]