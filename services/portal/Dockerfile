FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/portal/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/portal/package.json ./
RUN npm install --omit=dev

COPY services/portal/src ./services/portal/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/portal/src/index.js"]
