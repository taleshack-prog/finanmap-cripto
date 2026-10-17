FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o conteúdo do ga-engine (src/, main.py, etc)
COPY . .

EXPOSE 8000

# Usa main.py na raiz (que importa de src/) para compatibilidade com Railway
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
