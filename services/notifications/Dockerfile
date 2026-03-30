FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/notifications/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/notifications/package.json ./
RUN npm install --omit=dev

COPY services/notifications/src ./services/notifications/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/notifications/src/index.js"]
