# Deploy Guide — FinanMap Cripto

## Arquitetura de Produção

```
Vercel (frontend Next.js)
    ↓ API calls
Railway Serviço 1: backend (Express + Prisma)
    ↓ DATABASE_URL
Railway Plugin: PostgreSQL
    ↓ REDIS_URL  
Railway Plugin: Redis

Railway Serviço 2: ga-engine (FastAPI)
    ↓ mesma DATABASE_URL + BINANCE keys
```

---

## ETAPA 1 — Preparar o repositório (no seu notebook)

### 1.1 Copiar arquivos de configuração

```bash
cd ~/Downloads/finanmap-cripto

# Copiar arquivos de config de deploy
cp /tmp/deploy-files/vercel.json ./vercel.json
cp /tmp/deploy-files/next.config.js ./frontend/next.config.js
cp /tmp/deploy-files/Dockerfile.backend ./backend/Dockerfile
cp /tmp/deploy-files/Dockerfile.ga-engine ./ga-engine/Dockerfile
cp /tmp/deploy-files/railway-backend.toml ./backend/railway.toml
cp /tmp/deploy-files/railway-ga-engine.toml ./ga-engine/railway.toml
cp /tmp/deploy-files/requirements.txt ./ga-engine/requirements.txt
```

### 1.2 Atualizar .gitignore

```bash
cat >> .gitignore << 'EOF'

# Deploy
.env.production
*.env.local
.vercel
EOF
```

### 1.3 Commit e push

```bash
git add .
git commit -m "chore: add deploy configs (Vercel + Railway)"
git push origin main
```

---

## ETAPA 2 — Railway (Backend + GA Engine + PostgreSQL)

### 2.1 Criar projeto no Railway

1. Acesse https://railway.app → **New Project**
2. Escolha **Deploy from GitHub repo** → selecione `taleshack-prog/finanmap-cripto`
3. Clique em **Configure** → defina o **Root Directory** como `/backend`

### 2.2 Adicionar PostgreSQL

No projeto Railway:
1. **+ New** → **Database** → **Add PostgreSQL**
2. Clique no plugin PostgreSQL → copie a `DATABASE_URL`

### 2.3 Adicionar Redis

1. **+ New** → **Database** → **Add Redis**
2. Copie a `REDIS_URL`

### 2.4 Configurar variáveis do backend

No serviço `backend` → **Variables** → adicione:

```
NODE_ENV=production
PORT=4000
JWT_SECRET=<gerar com: openssl rand -base64 64>
JWT_EXPIRES_IN=7d
DATABASE_URL=<colado do plugin PostgreSQL>
REDIS_URL=<colado do plugin Redis>
FRONTEND_URL=https://finanmap-cripto.vercel.app
GA_ENGINE_URL=https://finanmap-ga.up.railway.app
BINANCE_API_KEY=<sua key>
BINANCE_SECRET=<seu secret>
```

### 2.5 Criar segundo serviço para GA Engine

1. No mesmo projeto Railway → **+ New Service** → **GitHub Repo**
2. Mesmo repo, Root Directory: `/ga-engine`
3. Nome do serviço: `ga-engine`

Variáveis do ga-engine:
```
DATABASE_URL=<mesma do backend>
REDIS_URL=<mesma>
BINANCE_API_KEY=<sua key>
BINANCE_SECRET=<seu secret>
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### 2.6 Anotar URLs do Railway

Após deploy, Railway gera URLs automáticas:
- Backend: `https://finanmap-backend-production.up.railway.app`
- GA Engine: `https://finanmap-ga-production.up.railway.app`

---

## ETAPA 3 — Vercel (Frontend)

### 3.1 Criar projeto no Vercel

1. Acesse https://vercel.com → **Add New Project**
2. Import do GitHub → `taleshack-prog/finanmap-cripto`
3. **Root Directory**: `frontend`
4. Framework: **Next.js** (detectado automático)

### 3.2 Configurar variáveis de ambiente no Vercel

Em **Environment Variables**:
```
NEXT_PUBLIC_API_URL=https://finanmap-backend-production.up.railway.app
NEXT_PUBLIC_GA_URL=https://finanmap-ga-production.up.railway.app
```

### 3.3 Deploy

Clique **Deploy**. O Vercel vai:
1. Instalar dependências (`npm install`)
2. Build (`npm run build`)
3. Deploy estático + edge functions

URL final: `https://finanmap-cripto.vercel.app`

---

## ETAPA 4 — Pós-deploy: atualizar CORS no backend

Após ter as URLs do Vercel, atualizar no Railway (backend) a variável:
```
FRONTEND_URL=https://finanmap-cripto.vercel.app
```

---

## Verificação Final

```bash
# Testar backend
curl https://finanmap-backend-production.up.railway.app/api/status

# Testar GA Engine
curl https://finanmap-ga-production.up.railway.app/status

# Testar WebSocket (no browser console)
const ws = new WebSocket('wss://finanmap-ga-production.up.railway.app/ws/monitor/BTC%2FUSDT')
ws.onmessage = (e) => console.log(JSON.parse(e.data))
```

---

## CI/CD Automático

Após setup inicial, todo `git push origin main` re-deploya automaticamente:
- **Vercel**: detecta mudanças em `/frontend`
- **Railway**: detecta mudanças em `/backend` ou `/ga-engine` (por root directory)

---

## Notas de segurança (PDF §3.9)

- `BINANCE_API_KEY` — apenas permissão **trade**, NUNCA saque
- `JWT_SECRET` — mínimo 64 chars, gerado com `openssl rand -base64 64`
- Nenhuma key no código ou git
- Railway e Vercel criptografam variáveis em repouso
