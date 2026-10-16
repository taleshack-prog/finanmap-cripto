# backend/Dockerfile — build com context da raiz do monorepo (Railway)
FROM node:20-alpine AS builder

WORKDIR /app
# Copia apenas o subdiretório backend
COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
