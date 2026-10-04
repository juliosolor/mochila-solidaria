# Mochila Solidaria: imagen mínima con Node 22.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Carpeta para la base de datos local de la fase de prueba (se monta como volumen)
RUN mkdir -p /data && chown node:node /data
ENV PGLITE_DIR=/data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
