#!/bin/bash
# FinanMap Cripto — Script de Parada

PROJECT_DIR="$HOME/Downloads/finanmap-cripto"
LOG_DIR="$PROJECT_DIR/logs"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}▸ Parando FinanMap Cripto...${NC}"

# Para via PID files
for service in backend ga-engine frontend; do
    PID_FILE="$LOG_DIR/$service.pid"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 $PID 2>/dev/null; then
            kill $PID 2>/dev/null
            echo "  ✓ $service parado"
        fi
        rm -f "$PID_FILE"
    fi
done

# Garante que as portas estão livres
for PORT in 3010 3020 8110; do
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill $PID 2>/dev/null
    fi
done

sleep 1
echo -e "${GREEN}  ✓ Todos os serviços parados.${NC}"
