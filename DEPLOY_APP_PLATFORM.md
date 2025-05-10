# Deploy no App Platform do DigitalOcean

Este guia vai ajudar você a realizar o deploy deste aplicativo usando o App Platform da DigitalOcean.

## Pré-requisitos

- Um repositório GitHub com o código do projeto (você já tem isso)
- Um banco de dados PostgreSQL criado no DigitalOcean (você já tem isso)
- Uma conta no DigitalOcean com acesso ao App Platform

## Passo a Passo

### 1. Faça o push das alterações para o GitHub

Verifique se todas as alterações que fizemos estão no seu repositório GitHub:

```bash
git add .
git commit -m "Preparação para deploy no App Platform"
git push origin main  # ou master, dependendo do nome da sua branch principal
```

### 2. Acesse o App Platform no DigitalOcean

1. Faça login na sua conta do DigitalOcean
2. No menu lateral, clique em "Apps"
3. Clique no botão "Create App"

### 3. Conecte seu repositório

1. Escolha GitHub como provedor de código
2. Autorize o DigitalOcean a acessar seu GitHub, se solicitado
3. Selecione o repositório que contém o código do seu projeto
4. Escolha a branch principal (geralmente `main` ou `master`)

### 4. Configure o aplicativo

Agora temos duas opções para configurar o aplicativo. Recomendamos usar o **Método 2 (Usando Dockerfile)** porque ele irá resolver o problema do pacote `@vitejs/plugin-react` que está causando falhas no build.

#### Método 1 (Configuração Padrão - Não Recomendado)

Se quiser configurar manualmente (não recomendado):

1. Tipo: Web Service
2. Região: Escolha a mesma região do seu banco de dados
3. Branch: sua branch principal
4. Diretório de origem: `/` (raiz do projeto)
5. Build Command: `npm ci && npm run build`
6. Run Command: `node dist/index.js`

#### Método 2 (Usando Dockerfile - Recomendado)

Nós preparamos um Dockerfile para facilitar o deploy e resolver o problema do build:

1. Tipo: Web Service
2. Região: Escolha a mesma região do seu banco de dados
3. Branch: sua branch principal
4. **IMPORTANTE**: Na configuração avançada, selecione **"Use a Dockerfile"**
5. Certifique-se de que o "Dockerfile Path" esteja definido como `Dockerfile` (já deve estar)

### 5. Configure as variáveis de ambiente

Você precisará adicionar as mesmas variáveis de ambiente que estão no arquivo `.env` que criamos:

1. Na seção "Environment Variables", adicione as seguintes variáveis:

```
DATABASE_URL=postgres://dbnovobicho:AVNS_Viy3ObhvZqKE1zrKQWX@app-f83e6f0f-1f27-4089-8a14-7bc1ea2c2ab3-do-user-21865989-0.k.db.ondigitalocean.com:25060/dbnovobicho?sslmode=require
PGUSER=dbnovobicho
PGPASSWORD=AVNS_Viy3ObhvZqKE1zrKQWX
PGDATABASE=dbnovobicho
PGHOST=app-f83e6f0f-1f27-4089-8a14-7bc1ea2c2ab3-do-user-21865989-0.k.db.ondigitalocean.com
PGPORT=25060
NODE_ENV=production
PORT=8080
SESSION_SECRET=your-session-secret-a41dae4b88ab404a8e6
```

**Importante**: O valor de `PORT` deve ser `8080` para o App Platform, e não `3000` como estamos usando localmente.

### 6. Conecte ao banco de dados

1. Na seção "Resources", você pode conectar seu banco de dados PostgreSQL existente na DigitalOcean (aquele que você já criou).
2. Isso criará automaticamente uma conexão segura entre seu app e seu banco de dados.

### 7. Finalizar e implantar

1. Revise todas as configurações
2. Escolha um nome para seu app
3. Escolha o plano de preços (Basic ou Pro)
4. Clique em "Launch App"

### 8. Aguarde a implantação

O DigitalOcean irá executar o processo de construção e implantação do seu aplicativo. Isso pode levar alguns minutos.

### 9. Acesse seu aplicativo

Uma vez concluído o deploy, você pode acessar seu aplicativo através da URL fornecida pelo DigitalOcean (algo como `https://seu-app-abcde.ondigitalocean.app`).

## Solução de problemas

### Problemas durante o deploy

Se você encontrar problemas durante o deploy:

1. Verifique os logs de construção e implantação no dashboard do App Platform
2. Verifique se todas as variáveis de ambiente estão configuradas corretamente
3. Verifique se o banco de dados está conectado e acessível

### Problema específico: "Cannot find package '@vitejs/plugin-react'"

Se você encontrar este erro específico:

```
Error: [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitejs/plugin-react' imported from /workspace/vite.config.ts
```

Este erro ocorre porque o App Platform por padrão não instala as dependências de desenvolvimento (`devDependencies`), mas o pacote `@vitejs/plugin-react` é necessário para o build. 

**Solução:** Use o Método 2 (Dockerfile) mencionado anteriormente na seção "Configure o aplicativo". O Dockerfile já está configurado para instalar todas as dependências, incluindo as de desenvolvimento, o que resolverá este problema.

### Banco de dados

Se o aplicativo estiver funcionando, mas você não conseguir fazer login ou não ver dados, talvez seja necessário executar a migração do banco de dados. Para fazer isso, você pode:

1. Acessar o Console do App Platform
2. Executar manualmente o comando: `npm run db:push`
