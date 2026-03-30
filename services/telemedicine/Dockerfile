FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/telemedicine/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/telemedicine/package.json ./
RUN npm install --omit=dev

COPY services/telemedicine/src ./services/telemedicine/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/telemedicine/src/index.js"]
