# Instruções para Deploy no DigitalOcean

Estas instruções vão te guiar no processo de implantação deste site no DigitalOcean.

## Pré-requisitos

1. Uma conta no DigitalOcean
2. Um banco de dados PostgreSQL criado no DigitalOcean (você já tem isso configurado)
3. Um Droplet (servidor virtual) no DigitalOcean com Ubuntu ou sistema similar

## Passo a Passo

### 1. Preparar o Servidor

Conecte-se ao seu servidor via SSH e instale as dependências necessárias:

```bash
# Atualizar repositórios de pacotes
sudo apt update

# Instalar Node.js e npm
sudo apt install -y nodejs npm

# Instalar versão LTS do Node usando o n (gerenciador de versões do Node)
sudo npm install -g n
sudo n lts

# Recarregar shell para usar a nova versão do Node
exec $SHELL

# Verificar versão do Node.js e npm
node -v  # Deve mostrar v18.x ou superior
npm -v   # Deve mostrar 8.x ou superior

# Instalar o gerenciador de processos PM2 para manter o aplicativo em execução
sudo npm install -g pm2
```

### 2. Clonar o Repositório

```bash
# Navegue até o diretório onde deseja instalar o aplicativo
cd /var/www

# Clone o repositório (substitua pelo URL do seu repositório)
git clone [URL_DO_SEU_REPOSITÓRIO]
cd [NOME_DO_DIRETÓRIO_CLONADO]
```

### 3. Configurar Variáveis de Ambiente

O arquivo `.env` já foi criado com as configurações do seu banco de dados.

### 4. Instalar Dependências e Fazer Deploy

Você pode usar o script de deploy que criamos:

```bash
# Dar permissão de execução ao script
chmod +x deploy-digitalocean.sh

# Executar script de deploy
./deploy-digitalocean.sh
```

OU seguir estes passos manualmente:

```bash
# Instalar dependências
npm ci --only=production

# Executar migrações do banco de dados
npm run db:push

# Construir o aplicativo frontend
npm run build

# Iniciar a aplicação com PM2 para manter rodando mesmo após desconectar
pm2 start npm -- start

# Configurar para iniciar automaticamente no boot do sistema
pm2 save
pm2 startup
# Execute o comando mostrado pelo PM2 (sudo env PATH=...)
```

### 5. Configurar Nginx como Proxy Reverso

Para servir seu aplicativo através da porta 80 (HTTP) e possivelmente 443 (HTTPS):

```bash
# Instalar Nginx
sudo apt install -y nginx

# Criar arquivo de configuração para o site
sudo nano /etc/nginx/sites-available/bichobicho
```

Coloque o seguinte conteúdo:

```nginx
server {
    listen 80;
    server_name seu-dominio.com www.seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Depois, ative a configuração e reinicie o Nginx:

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/bichobicho /etc/nginx/sites-enabled/

# Verificar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 6. Configurar SSL com Let's Encrypt (opcional, mas recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado e configurar Nginx
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com

# Siga as instruções na tela
```

### 7. Verificar Deployments

```bash
# Verificar logs da aplicação
pm2 logs

# Verificar status
pm2 status
```

## Manutenção e Atualizações

Para atualizar o aplicativo após mudanças no repositório:

```bash
# Navegar até o diretório do projeto
cd /var/www/[NOME_DO_DIRETÓRIO_CLONADO]

# Puxar as mudanças mais recentes
git pull

# Executar script de deploy novamente
./deploy-digitalocean.sh

# OU manualmente
npm ci --only=production
npm run build
pm2 restart all
```
