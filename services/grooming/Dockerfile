FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# Shared modules
COPY ../../shared ./shared

COPY src ./src

EXPOSE $PORT
USER node
CMD ["node", "src/index.js"]
