# 🚀 FinanMap Cripto

Plataforma de otimização de portfólios cripto com Algoritmo Genético.

## Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + Prisma + PostgreSQL
- **GA Engine**: Python + FastAPI + DEAP
- **Infra**: Docker + Redis + GitHub Actions

## Início Rápido

```bash
# 1. Clonar e instalar
git clone https://github.com/SEU_USUARIO/finanmap-cripto.git
cd finanmap-cripto
cp .env.example .env  # edite com suas credenciais

# 2. Subir com Docker (recomendado)
docker-compose up --build -d

# 3. Ou rodar local
cd backend && npm install && npm run dev     # porta 3001
cd frontend && npm install && npm run dev    # porta 3000
cd ga-engine && pip install -r requirements.txt && uvicorn src.main:app --reload --port 8000
```

## URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- GA Engine: http://localhost:8000
- Docs API: http://localhost:8000/docs

## Estrutura
```
finanmap-cripto/
├── frontend/     # Next.js 14
├── backend/      # Express + Prisma
├── ga-engine/    # FastAPI + DEAP
├── database/     # Migrations SQL
└── .github/      # CI/CD
```
