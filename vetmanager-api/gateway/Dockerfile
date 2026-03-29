FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json ./
RUN npm install --omit=dev

# Copy shared modules
COPY ../shared ./shared

# Copy service source
COPY src ./src
COPY docs ./docs 2>/dev/null || true

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
