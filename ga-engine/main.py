"""
FinanMap Cripto - GA Engine
Entrypoint wrapper para compatibilidade com Railway/Nixpacks.
"""
import subprocess
import sys
import os

# Instala dependências se fastapi não estiver disponível
try:
    import fastapi
except ImportError:
    print("[startup] fastapi não encontrado — instalando dependências...")
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--no-cache-dir", "-r", "requirements.txt"
    ])
    print("[startup] Dependências instaladas.")

# Importa o app do módulo principal
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.main import app

__all__ = ["app"]
