# backend/Dockerfile — build com context da raiz do monorepo (Railway)
FROM node:20-alpine AS builder

WORKDIR /app

# Copia package.json do backend
COPY backend/package*.json ./

# Instala TODAS as deps (incluindo devDeps para o build TypeScript)
RUN npm install

# Copia código do backend
COPY backend/ .

# Compila TypeScript
RUN npm run build

# Gera Prisma client
RUN npx prisma generate

# --- Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copia apenas o necessário para runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
