# backend/Dockerfile — build com context = /backend (Root Directory = '/backend' no Railway)
# Paths SEM prefixo 'backend/' porque o context JÁ É a pasta backend/

FROM node:20-alpine AS builder

WORKDIR /app

# Copia package.json (context é backend/, então sem prefixo)
COPY package*.json ./

# Instala TODAS as deps (incluindo devDeps para o build TypeScript)
RUN npm install

# Copia código
COPY . .

# Compila TypeScript
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
