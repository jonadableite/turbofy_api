FROM node:20-alpine AS builder
WORKDIR /app

# Dependências do sistema necessárias para o Prisma
RUN apk add --no-cache libc6-compat

# Copiar manifests e instalar dependências (inclui dev para build)
COPY package*.json ./
RUN npm ci

# Copiar código e configs
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
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

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD ["node", "/app/healthcheck.js"]

# Rodar migrations e subir servidor
# O prisma migrate deploy usa o prisma.config.ts para obter a DATABASE_URL
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]