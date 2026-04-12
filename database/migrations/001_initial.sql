-- FinanMap Cripto - Schema Inicial
-- Executado automaticamente pelo Docker

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil_risco VARCHAR(20) DEFAULT 'moderado',
    saldo_total DECIMAL(20, 8) DEFAULT 0,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_name VARCHAR(50) NOT NULL,
    ativo VARCHAR(20) NOT NULL,
    quantidade DECIMAL(20, 8) NOT NULL,
    preco_unitario DECIMAL(20, 8) NOT NULL,
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, exchange_name, ativo)
);

CREATE TABLE IF NOT EXISTS estrategias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    geracao INT DEFAULT 1,
    cromossomo JSONB NOT NULL DEFAULT '{}',
    fitness_score FLOAT DEFAULT 0,
    retorno_esperado FLOAT DEFAULT 0,
    volatilidade FLOAT DEFAULT 0,
    ativa BOOLEAN DEFAULT FALSE,
    data_criacao TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    estrategia_id UUID REFERENCES estrategias(id),
    exchange_name VARCHAR(50) NOT NULL,
    par_trading VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    quantidade DECIMAL(20, 8) NOT NULL,
    preco_entrada DECIMAL(20, 8) NOT NULL,
    preco_saida DECIMAL(20, 8),
    lucro DECIMAL(20, 8),
    lucro_percentual FLOAT,
    status VARCHAR(20) DEFAULT 'aberto',
    timestamp_entrada TIMESTAMP DEFAULT NOW(),
    timestamp_saida TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_estrategias_user ON estrategias(user_id, ativa);
