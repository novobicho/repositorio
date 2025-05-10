# Instruções de Deploy no DigitalOcean (Atualizado)

Este documento fornece instruções detalhadas para implantar a aplicação Jogo do Bicho no DigitalOcean App Platform, resolvendo os problemas de conexão com o banco de dados Postgres em ambiente de produção.

## Requisitos Prévios

- Conta no DigitalOcean
- CLI do DigitalOcean (`doctl`) instalado
- Token de API do DigitalOcean
- Banco de dados PostgreSQL acessível externamente

## Configuração do Ambiente

### 1. Configurar Variáveis de Ambiente

```bash
# Token de acesso ao DigitalOcean
export DIGITALOCEAN_ACCESS_TOKEN=seu_token_aqui

# Nome da aplicação (opcional)
export APP_NAME=jogo-do-bicho-app
```

### 2. Verificar Configuração do Banco de Dados

Certifique-se de que você possui um banco de dados PostgreSQL configurado e acessível externamente. Anote as seguintes informações:

- URL de conexão completa (formato: `postgresql://usuario:senha@host:porta/database?ssl=true`)
- Usuário e senha do banco de dados
- Nome do banco de dados
- Host e porta

## Processo de Deploy

### 1. Atualizar o arquivo `app.json`

Verifique se o arquivo `app.json` contém todas as configurações necessárias, especialmente as variáveis de ambiente:

```json
{
  "name": "jogo-do-bicho-app",
  "services": [
    {
      "name": "web",
      "github": {
        "repo": "seu-usuario/seu-repo",
        "branch": "main"
      },
      "envs": [
        {
          "key": "NODE_ENV",
          "value": "production"
        },
        {
          "key": "DATABASE_URL",
          "value": "postgresql://usuario:senha@host:porta/database?ssl=true"
        },
        {
          "key": "SESSION_SECRET",
          "value": "uma_string_secreta_longa"
        },
        {
          "key": "PORT",
          "value": "8080"
        }
      ],
      "instance_count": 1,
      "instance_size_slug": "basic-xs"
    }
  ],
  "databases": [
    {
      "name": "db",
      "engine": "PG",
      "version": "14"
    }
  ]
}
```

### 2. Executar o Script de Deploy

Execute o script de deploy atualizado:

```bash
./deploy-digitalocean-atualizado.sh
```

O script realizará as seguintes operações:
- Construir a aplicação
- Criar ou atualizar a aplicação no DigitalOcean App Platform
- Exibir a URL da aplicação implantada

### 3. Inicializar o Banco de Dados (Apenas na Primeira Implantação)

Após a implantação, acesse o endpoint de inicialização do banco de dados:

```
https://sua-app.ondigitalocean.app/api/reset-database
```

**IMPORTANTE**: Este endpoint deve ser acessado apenas uma vez, após a primeira implantação. Após usar este endpoint, você deve protegê-lo ou removê-lo para evitar a reinicialização acidental do banco de dados.

## Solução de Problemas

### Problemas com Conexão WebSocket

O cliente `@neondatabase/serverless` usa WebSockets para conexão, o que pode causar problemas no ambiente DigitalOcean App Platform. A solução implementada alternativa usa:

- Em desenvolvimento: `@neondatabase/serverless` com WebSockets
- Em produção: o cliente `pg` padrão sem WebSockets

Esta solução é implementada nos arquivos:
- `server/db.ts` (padrão para desenvolvimento)
- `server/db-prod.ts` (específico para produção)
- `server/db-selector.ts` (seletor baseado no ambiente)

### Erros Comuns

1. **Erro de Conexão ao Banco de Dados**:
   - Verifique se a URL do banco de dados está correta
   - Confirme se o banco de dados permite conexões externas
   - Verifique se as configurações de SSL estão corretas

2. **Erro "Porta já em uso"**:
   - O DigitalOcean App Platform espera que o aplicativo use a porta 8080
   - Certifique-se de que a variável PORT está definida como 8080

3. **Erro de Aplicação não Encontrada**:
   - Verifique se o nome da aplicação está correto
   - Confirme se você tem permissões para criar/atualizar aplicações

## Monitoramento da Aplicação

Após o deploy, você pode monitorar a aplicação através do painel do DigitalOcean:

1. Acesse o [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Selecione sua aplicação
3. Verifique logs, métricas e configurações

## Manutenção

### Atualizações

Para atualizar a aplicação, basta executar o script de deploy novamente:

```bash
./deploy-digitalocean-atualizado.sh
```

### Backup e Restauração

Certifique-se de realizar backups regulares do banco de dados. O DigitalOcean oferece recursos automáticos de backup para bancos de dados gerenciados.

## Conclusão

Seguindo estas instruções, você deve ser capaz de implantar com sucesso a aplicação Jogo do Bicho no DigitalOcean App Platform, evitando os problemas comuns de conexão WebSocket com o banco de dados PostgreSQL.