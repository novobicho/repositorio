#!/bin/bash
# Script para inicialização do ambiente no DigitalOcean

# Verificação de variáveis de ambiente
if [ -z "$DATABASE_URL" ]; then
  echo "Erro: DATABASE_URL não está definida"
  exit 1
fi

if [ -z "$PUSHIN_PAY_TOKEN" ]; then
  echo "Aviso: PUSHIN_PAY_TOKEN não está definida"
fi

echo "Iniciando preparação do ambiente..."

# Executar migrações de banco de dados
echo "Executando migrações de banco de dados..."
npm run db:push

# Inicializar dados padrão (se necessário)
echo "Inicializando dados padrão..."
node init-admin.ts

echo "Ambiente preparado com sucesso!"
