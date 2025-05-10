# Dockerfile para a aplicação Jogo do Bicho
FROM node:18-alpine

# Cria diretório da aplicação
WORKDIR /app

# Instala dependências do sistema
RUN apk add --no-cache postgresql-client

# Copia arquivos de configuração de pacotes
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o resto dos arquivos da aplicação
COPY . .

# Compila a aplicação (TypeScript)
RUN npm run build

# Expor porta
EXPOSE 5000

# Comando para iniciar a aplicação
CMD ["node", "server/index.js"]