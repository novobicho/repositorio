# Instruções Detalhadas para Configuração do Banco de Dados no DigitalOcean

Este guia fornece instruções passo a passo para configurar corretamente o banco de dados PostgreSQL para uso com a aplicação Jogo do Bicho no ambiente DigitalOcean.

## Problema Identificado com o Neon PostgreSQL 

A biblioteca `@neondatabase/serverless` usada no modo de desenvolvimento depende de WebSockets para manter conexões com o banco de dados. No ambiente de produção do DigitalOcean App Platform, estas conexões WebSocket podem ser instáveis ou bloqueadas, causando falhas na aplicação.

Para resolver este problema, criamos um sistema de conexão dual que:
1. Usa `@neondatabase/serverless` em desenvolvimento
2. Usa o cliente `pg` padrão em produção

## Opções de Banco de Dados no DigitalOcean

Existem duas principais opções para usar PostgreSQL no DigitalOcean:

### 1. Banco de Dados Gerenciado (DigitalOcean Managed Database)

**Vantagens:**
- Gerenciado pelo DigitalOcean (backups automáticos, atualizações)
- Alta disponibilidade
- Conexão segura

**Configuração:**

1. No painel do DigitalOcean, vá para "Databases"
2. Clique em "Create Database Cluster"
3. Selecione "PostgreSQL"
4. Escolha o plano e região (recomendamos usar a mesma região do App Platform)
5. Configure nome e usuário
6. Aguarde a criação (pode levar alguns minutos)

**Obter String de Conexão:**

Após criar o banco, vá para:
1. "Connection Details"
2. "Connection String"
3. Copie a string no formato: `postgresql://usuario:senha@host:porta/database?ssl=true`

### 2. Banco Interno do App Platform

O DigitalOcean App Platform permite criar um banco de dados PostgreSQL junto com a aplicação.

**Configuração:**

No arquivo `app.json`, inclua:

```json
"databases": [
  {
    "name": "db",
    "engine": "PG",
    "version": "14"
  }
]
```

A URL de conexão será injetada automaticamente como variável de ambiente `DATABASE_URL`.

## Inicialização do Banco de Dados

Após o deploy, o banco de dados estará vazio. É necessário inicializá-lo com as tabelas e dados iniciais.

### API de Inicialização

A aplicação inclui um endpoint especial para inicialização do banco:

```
https://sua-app.ondigitalocean.app/api/reset-database
```

**ATENÇÃO:** Este endpoint:
- Só deve ser acessado **uma única vez** após o primeiro deploy
- Cria todas as tabelas necessárias
- Inicializa dados básicos (usuário admin, animais, modos de jogo)
- Deve ser protegido ou removido após o uso inicial

### Inicialização Manual (Alternativa)

Se preferir, você pode executar o SQL de inicialização manualmente:

1. Conecte-se ao banco usando uma ferramenta como pgAdmin, DBeaver ou psql
2. Execute os scripts SQL encontrados em `server/db-init.sql`

## Resolução de Problemas Comuns

### Erro "Socket hang up" ou "WebSocket connection failed"

**Sintoma:** A aplicação não consegue conectar ao banco de dados em produção com erros de WebSocket.

**Solução:** Esta aplicação já implementa a solução usando o cliente `pg` padrão em vez de `@neondatabase/serverless` no ambiente de produção.

### Erro "Connection refused"

**Verificações:**
- Verifique se a URL do banco de dados está correta
- Confirme se o firewall do banco permite conexões externas
- Verifique se a aplicação e o banco estão na mesma região

### Erro "password authentication failed"

**Verificações:**
- Verifique se a senha na string de conexão está correta
- Tente conectar usando uma ferramenta externa para confirmar as credenciais

### Erro "database does not exist"

**Solução:** 
1. Conecte ao servidor PostgreSQL 
2. Crie o banco de dados manualmente:
   ```sql
   CREATE DATABASE nome_do_banco;
   ```

## Migração de Banco de Dados

Para migrar entre ambientes (desenvolvimento para produção):

1. Faça backup do banco de desenvolvimento:
   ```bash
   pg_dump -U usuario -h host -d banco > backup.sql
   ```

2. Restaure no banco de produção:
   ```bash
   psql -U usuario -h host -d banco < backup.sql
   ```

## Monitoramento e Manutenção

### Backups

Se estiver usando DigitalOcean Managed Database, os backups são automáticos. Para banco interno do App Platform, configure backups regulares usando:

```bash
pg_dump -U usuario -h host -d banco > backup_$(date +%Y%m%d).sql
```

### Verificação de Conexões

Para verificar conexões ativas:

```sql
SELECT * FROM pg_stat_activity;
```

### Reiniciar Conexões Problemáticas

Se houver conexões em estado "idle in transaction" por muito tempo:

```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND state_change < now() - interval '30 minutes';
```

## Conclusão

Seguindo estas instruções, você terá um banco de dados PostgreSQL corretamente configurado para sua aplicação no DigitalOcean, evitando os problemas de WebSocket que podem ocorrer no ambiente de produção.