FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/grooming/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/grooming/package.json ./
RUN npm install --omit=dev

COPY services/grooming/src ./services/grooming/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/grooming/src/index.js"]
