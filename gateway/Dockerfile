FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copy service source
COPY src ./src

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]