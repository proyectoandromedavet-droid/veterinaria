FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/auth/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/auth/package.json ./
RUN npm install --omit=dev

COPY services/auth/src ./services/auth/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/auth/src/index.js"]
