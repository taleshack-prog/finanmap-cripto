-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfilRisco" TEXT NOT NULL DEFAULT 'moderado',
    "saldoTotal" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeName" TEXT NOT NULL,
    "ativo" TEXT NOT NULL,
    "quantidade" DECIMAL(20,8) NOT NULL,
    "precoUnitario" DECIMAL(20,8) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estrategia" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "geracao" INTEGER NOT NULL DEFAULT 1,
    "cromossomo" JSONB NOT NULL,
    "fitnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retornoEsperado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volatilidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estrategia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "estrategiaId" TEXT,
    "exchangeName" TEXT NOT NULL,
    "parTrading" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(20,8) NOT NULL,
    "precoEntrada" DECIMAL(20,8) NOT NULL,
    "precoSaida" DECIMAL(20,8),
    "lucro" DECIMAL(20,8),
    "lucroPercentual" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "timestampEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timestampSaida" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_exchangeName_ativo_key" ON "Portfolio"("userId", "exchangeName", "ativo");

-- CreateIndex
CREATE INDEX "Estrategia_userId_ativa_idx" ON "Estrategia"("userId", "ativa");

-- CreateIndex
CREATE INDEX "Trade_userId_status_idx" ON "Trade"("userId", "status");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estrategia" ADD CONSTRAINT "Estrategia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_estrategiaId_fkey" FOREIGN KEY ("estrategiaId") REFERENCES "Estrategia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
