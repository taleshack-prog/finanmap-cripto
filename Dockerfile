# Dockerfile — raiz do monorepo (Railway backend service)
# Railway detecta este arquivo automaticamente e usa Docker em vez de Nixpacks

FROM node:20-alpine AS builder

WORKDIR /app

# Deps do backend
COPY backend/package*.json ./
RUN npm install

# Código + prisma
COPY backend/ .

# Build TypeScript
RUN npm run build

# Gera Prisma client
RUN npx prisma generate

# --- Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
