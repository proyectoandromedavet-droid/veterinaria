FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/reports/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/reports/package.json ./
RUN npm install --omit=dev

COPY services/reports/src ./services/reports/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/reports/src/index.js"]
