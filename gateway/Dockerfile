FROM node:20-alpine
WORKDIR /app

# Install deps (build context must be the monorepo root)
COPY gateway/package.json gateway/package-lock.json ./
RUN npm install --omit=dev

# Copy service source and shared utilities
COPY gateway/src ./src
COPY shared ./shared

# Crear carpeta logs con permisos correctos ANTES de cambiar a user node
RUN mkdir -p /app/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]