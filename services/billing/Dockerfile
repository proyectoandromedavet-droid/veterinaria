FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/billing/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/billing/package.json ./
RUN npm install --omit=dev

COPY services/billing/src ./services/billing/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/billing/src/index.js"]
