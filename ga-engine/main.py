# Entrypoint alternativo — Railway às vezes detecta este arquivo como main
# Redireciona para o módulo correto em src/
# O start command correto é: uvicorn src.main:app --host 0.0.0.0 --port $PORT

import sys
import os

# Garante que o diretório atual está no path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Re-exporta o app do módulo correto
from src.main import app

__all__ = ["app"]
