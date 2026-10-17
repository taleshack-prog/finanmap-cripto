# Dockerfile — raiz do monorepo (Railway backend service)
# Root Directory = '/' no Railway UI

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY backend/package*.json ./
RUN npm install

COPY backend/ .

# DATABASE_URL fake só para prisma generate (não conecta, apenas gera tipos)
ENV DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"

RUN npx prisma generate
RUN npm run build

# --- Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL necessário para o Prisma migrate/query engine no Alpine
RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
