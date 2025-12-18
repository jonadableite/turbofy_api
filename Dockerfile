FROM node:20-alpine AS builder
WORKDIR /app

# Dependências do sistema necessárias para o Prisma
RUN apk add --no-cache libc6-compat

# Copiar manifests + prisma antes do npm ci (postinstall roda prisma:generate e precisa do schema)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

# Copiar código e configs restantes
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
COPY docker ./docker

# Gerar Prisma Client com URL dummy (não requer DB real)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npm run prisma:generate

# Build TS
RUN npm run build

# Remover devDependencies para reduzir tamanho
RUN npm prune --omit=dev

# --------------------------------------------------
# Runner
# --------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=3030

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/docker/healthcheck.js ./healthcheck.js
COPY --from=builder /app/docker/wait-for-db.js ./wait-for-db.js

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD ["node", "/app/healthcheck.js"]

# Rodar migrations e subir servidor
# Migrations são opcionais - se falharem, o servidor ainda inicia
# Útil quando o banco ainda não está acessível ou migrations já foram aplicadas
CMD ["sh", "-c", "if node wait-for-db.js 2>/dev/null; then echo '✅ Banco disponível, aplicando migrations...' && npx prisma migrate deploy || echo '⚠️ Migrate deploy falhou, mas continuando...'; else echo '⚠️ Banco não disponível ainda, pulando migrations...'; fi && echo '🚀 Iniciando servidor...' && node dist/index.js"]