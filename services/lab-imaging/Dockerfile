FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/lab-imaging/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/lab-imaging/package.json ./
RUN npm install --omit=dev

COPY services/lab-imaging/src ./services/lab-imaging/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/lab-imaging/src/index.js"]
