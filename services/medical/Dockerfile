FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/medical/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/medical/package.json ./
RUN npm install --omit=dev

COPY services/medical/src ./services/medical/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/medical/src/index.js"]
