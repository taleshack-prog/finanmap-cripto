#!/bin/bash
# Watchdog — reinicia serviços automaticamente se caírem

LOG="$HOME/Downloads/finanmap-cripto/logs/watchdog.log"
mkdir -p "$(dirname $LOG)"

check_and_restart() {
    # Verifica backend
    if ! curl -s http://localhost:3020/api/status > /dev/null 2>&1; then
        echo "$(date) [WATCHDOG] Backend caiu — reiniciando..." >> $LOG
        fuser -k 3020/tcp 2>/dev/null
        cd ~/Downloads/finanmap-cripto/backend && npm run dev >> $LOG 2>&1 &
        sleep 10
    fi

    # Verifica GA Engine
    if ! curl -s http://localhost:8110/status > /dev/null 2>&1; then
        echo "$(date) [WATCHDOG] GA Engine caiu — reiniciando..." >> $LOG
        fuser -k 8110/tcp 2>/dev/null
        cd ~/Downloads/finanmap-cripto/ga-engine && \
        source venv/bin/activate && \
        export $(cat ~/Downloads/finanmap-cripto/.env | grep -v '#' | grep -v '^$' | xargs) && \
        uvicorn src.main:app --port 8110 >> $LOG 2>&1 &
    fi
}

echo "$(date) [WATCHDOG] Iniciado — verificando a cada 60s" >> $LOG
while true; do
    check_and_restart
    sleep 60
done
