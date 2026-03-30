FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/ai/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/ai/package.json ./
RUN npm install --omit=dev

COPY services/ai/src ./services/ai/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/ai/src/index.js"]
