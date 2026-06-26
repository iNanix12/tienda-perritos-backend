# ---------- Etapa 1: instalación de dependencias ----------
FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm install --production && npm cache clean --force

# ---------- Etapa 2: imagen final ----------
FROM node:18-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
