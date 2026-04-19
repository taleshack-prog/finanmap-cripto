#!/bin/bash
# FinanMap Cripto — Script de Inicialização
# Sobe todos os serviços e abre o browser automaticamente

PROJECT_DIR="$HOME/Downloads/finanmap-cripto"

# Carrega NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
LOG_DIR="$PROJECT_DIR/logs"
FRONTEND_PORT=3010
BACKEND_PORT=3020
GA_PORT=8110

# Cores
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ███████╗██╗███╗   ██╗ █████╗ ███╗   ██╗███╗   ███╗ █████╗ ██████╗ "
echo "  ██╔════╝██║████╗  ██║██╔══██╗████╗  ██║████╗ ████║██╔══██╗██╔══██╗"
echo "  █████╗  ██║██╔██╗ ██║███████║██╔██╗ ██║██╔████╔██║███████║██████╔╝"
echo "  ██╔══╝  ██║██║╚██╗██║██╔══██║██║╚██╗██║██║╚██╔╝██║██╔══██║██╔═══╝ "
echo "  ██║     ██║██║ ╚████║██║  ██║██║ ╚████║██║ ╚═╝ ██║██║  ██║██║     "
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     "
echo "                          C R I P T O  v1.0"
echo -e "${NC}"

mkdir -p "$LOG_DIR"

# Função para verificar se porta está em uso
port_in_use() {
    lsof -ti:$1 > /dev/null 2>&1
}

# Função para aguardar serviço ficar pronto
wait_for_service() {
    local url=$1
    local name=$2
    local max_wait=30
    local count=0
    
    echo -ne "  Aguardando ${name}..."
    while ! curl -s "$url" > /dev/null 2>&1; do
        sleep 1
        count=$((count + 1))
        echo -ne "."
        if [ $count -ge $max_wait ]; then
            echo -e " ${RED}TIMEOUT${NC}"
            return 1
        fi
    done
    echo -e " ${GREEN}OK${NC}"
    return 0
}

echo -e "${YELLOW}▸ Verificando serviços existentes...${NC}"

# Para serviços antigos se estiverem rodando
if port_in_use $BACKEND_PORT; then
    echo "  Parando backend antigo..."
    kill $(lsof -ti:$BACKEND_PORT) 2>/dev/null
    sleep 1
fi

if port_in_use $GA_PORT; then
    echo "  Parando GA Engine antigo..."
    kill $(lsof -ti:$GA_PORT) 2>/dev/null
    sleep 1
fi

if port_in_use $FRONTEND_PORT; then
    echo "  Parando frontend antigo..."
    kill $(lsof -ti:$FRONTEND_PORT) 2>/dev/null
    sleep 1
fi

sleep 1

echo ""
echo -e "${YELLOW}▸ Iniciando Backend (Express + PostgreSQL)...${NC}"
cd "$PROJECT_DIR/backend"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"

echo -e "${YELLOW}▸ Iniciando GA Engine (FastAPI + Python)...${NC}"
cd "$PROJECT_DIR/ga-engine"
source venv/bin/activate
export $(cat "$PROJECT_DIR/.env" | grep -v '#' | grep -v '^$' | xargs)
# Aguarda backend estar pronto antes de subir GA Engine
echo "  Aguardando backend..."
for i in {1..30}; do
    if curl -s http://localhost:3020/api/status > /dev/null 2>&1; then
        echo "  ✓ Backend pronto"
        break
    fi
    sleep 2
done
uvicorn src.main:app --port $GA_PORT > "$LOG_DIR/ga-engine.log" 2>&1 &
GA_PID=$!
echo $GA_PID > "$LOG_DIR/ga-engine.pid"

echo -e "${YELLOW}▸ Iniciando Frontend (Next.js)...${NC}"
cd "$PROJECT_DIR/frontend"
npm run dev -- -p $FRONTEND_PORT > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"

echo ""
echo -e "${YELLOW}▸ Aguardando serviços ficarem prontos...${NC}"

wait_for_service "http://localhost:$BACKEND_PORT/api/status" "Backend"
wait_for_service "http://localhost:$GA_PORT/status"          "GA Engine"
wait_for_service "http://localhost:$FRONTEND_PORT"           "Frontend"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ FinanMap Cripto está rodando!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Dashboard:  ${CYAN}http://localhost:$FRONTEND_PORT/dashboard${NC}"
echo -e "  Backend:    ${CYAN}http://localhost:$BACKEND_PORT/api/status${NC}"
echo -e "  GA Engine:  ${CYAN}http://localhost:$GA_PORT/status${NC}"
echo ""
echo -e "  Logs em:    ${YELLOW}$LOG_DIR/${NC}"
echo ""

# Abre o browser automaticamente
sleep 2
google-chrome "http://localhost:$FRONTEND_PORT/dashboard" &

echo -e "${YELLOW}  Pressione Ctrl+C para parar todos os serviços${NC}"
echo ""

# Aguarda Ctrl+C
trap 'echo -e "\n${RED}▸ Parando FinanMap Cripto...${NC}"; kill $BACKEND_PID $GA_PID $FRONTEND_PID 2>/dev/null; rm -f "$LOG_DIR"/*.pid; echo -e "${GREEN}  ✓ Todos os serviços parados.${NC}"; exit 0' INT TERM

wait
