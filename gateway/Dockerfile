FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copy service source
COPY src ./src

# Crear carpeta logs con permisos correctos ANTES de cambiar a user node
RUN mkdir -p /app/logs && chown -R node:node /app

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]