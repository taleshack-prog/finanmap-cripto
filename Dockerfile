# Dockerfile — raiz do monorepo (Railway backend service)
# Root Directory = '/' no Railway UI

FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/ .

# Gera Prisma client ANTES do build TypeScript
RUN npx prisma generate

# Compila TypeScript
RUN npm run build

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
