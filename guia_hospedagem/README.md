# Recursos de Hospedagem para Jogo do Bicho

Este diretório contém recursos e instruções para hospedar o sistema Jogo do Bicho em diferentes plataformas.

## Conteúdo

- `guia_hospedagem_digitalocean.md` - Guia passo a passo detalhado para hospedagem no DigitalOcean
- `Dockerfile` - Para construção de um container Docker
- `docker-compose.yml` - Para deploy usando Docker Compose
- `nginx.conf` - Configuração do Nginx para uso como proxy reverso
- `app.yaml` - Configuração para o DigitalOcean App Platform
- `init-script.sh` - Script de inicialização para configuração pós-implantação

## Para iniciantes

Recomendamos começar com o arquivo `guia_hospedagem_digitalocean.md`, que fornece um tutorial detalhado para iniciantes.

## Requisitos de sistema

- Node.js 18 ou superior
- PostgreSQL 14 ou superior
- Conexão com a Internet para APIs externas

## Considerações de segurança

Ao hospedar este aplicativo, certifique-se de:

1. Nunca armazenar senhas ou tokens em arquivos públicos
2. Usar HTTPS para todas as conexões de produção
3. Configurar backups regulares do banco de dados
4. Limitar o acesso ao painel administrativo
