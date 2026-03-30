FROM node:20-alpine

# node_modules at /app so packages are reachable from /app/services/patients/src/
# and from /app/shared/ (both walk up to /app/node_modules).
WORKDIR /app

COPY services/patients/package.json ./
RUN npm install --omit=dev

COPY services/patients/src ./services/patients/src
COPY shared ./shared

EXPOSE $PORT
USER node
CMD ["node", "services/patients/src/index.js"]
