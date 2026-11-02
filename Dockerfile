# Imagen única de la aplicación: la misma en Docker Compose, en CI y en el despliegue.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencias antes que el código: esta capa se reutiliza mientras package*.json no cambie.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY db ./db

# La imagen oficial trae el usuario node: el proceso no corre como root.
USER node

EXPOSE 3000

# Forma exec: node recibe SIGTERM directamente y server.js cierra el pool antes de salir.
CMD ["node", "src/server.js"]
