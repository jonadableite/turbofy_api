# 🚀 Turbofy API - Backend

API backend do Turbofy - Gateway de Pagamentos e Marketplace de Infoprodutos.

## 📋 Sobre

API RESTful construída com Node.js, Express, TypeScript e Prisma, seguindo Arquitetura Hexagonal (Ports & Adapters). Projeto independente, sem dependências de monorepo.

## 🛠️ Stack Tecnológica

- **Runtime**: Node.js 20+
- **Framework**: Express.js 5
- **Linguagem**: TypeScript 5.9+
- **ORM**: Prisma 7
- **Banco de Dados**: PostgreSQL 16+
- **Mensageria**: RabbitMQ
- **Autenticação**: JWT
- **Validação**: Zod

## 📁 Estrutura do Projeto

```
api/
├── src/
│   ├── domain/          # Entidades e regras de negócio
│   ├── application/     # Casos de uso e serviços
│   ├── ports/           # Interfaces (repositórios, serviços externos)
│   └── infrastructure/  # Implementações (Prisma, HTTP, RabbitMQ, etc.)
├── prisma/
│   └── schema.prisma    # Schema do banco de dados
├── scripts/             # Scripts utilitários
├── docker/              # Arquivos Docker
└── docs/                # Documentação

```

## 🚀 Quick Start

### Pré-requisitos

- Node.js 20+
- npm 9+
- PostgreSQL 16+
- RabbitMQ (opcional para desenvolvimento local)

### Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 3. Gerar Prisma Client
npm run prisma:generate

# 4. Executar migrations
npm run prisma:migrate

# 5. Iniciar servidor de desenvolvimento
npm run dev
```

O servidor estará disponível em `http://localhost:3030`

## 🔧 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Inicia servidor com hot-reload

# Build
npm run build            # Compila TypeScript para JavaScript

# Prisma
npm run prisma:generate  # Gera Prisma Client
npm run prisma:migrate   # Executa migrations (desenvolvimento)
npm run prisma:migrate:deploy  # Deploy migrations (produção)
npm run prisma:studio    # Abre Prisma Studio (GUI)

# Testes
npm test                 # Executa testes

# Validação
npm run check-types      # Verifica tipos TypeScript
npm run check            # Verifica configuração do ambiente
```

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/turbofy

# Server
NODE_ENV=development
PORT=3030

# JWT
JWT_SECRET=your-secret-key-minimum-32-characters

# RabbitMQ
RABBITMQ_URI=amqp://localhost:5672

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-password
SMTP_SENDER_EMAIL=noreply@turbofy.com
SMTP_AUTH_DISABLED=false

# Frontend
FRONTEND_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3001

# Redis (opcional)
CACHE_REDIS_URI=redis://localhost:6379

# Payment Providers
TRANSFEERA_ENABLED=true
TRANSFEERA_CLIENT_ID=your-client-id
TRANSFEERA_CLIENT_SECRET=your-client-secret
TRANSFEERA_API_URL=https://api-sandbox.transfeera.com
TRANSFEERA_LOGIN_URL=https://login-api-sandbox.transfeera.com
TRANSFEERA_PIX_KEY=your-pix-key
TRANSFEERA_WEBHOOK_SECRET=your-webhook-secret-minimum-32-characters

# reCAPTCHA (opcional)
RECAPTCHA_SECRET_KEY=your-recaptcha-secret

# AWS S3 (opcional)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

Veja `ENV_EXAMPLE.md` para exemplos completos.

## 🐳 Docker

### Build

```bash
docker build -t turbofy-api .
```

### Run

```bash
docker run -p 3030:3030 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e JWT_SECRET=your-secret \
  turbofy-api
```

### Docker Compose (desenvolvimento)

```bash
docker-compose up
```

## 📚 Documentação

- [Documentação da API](./docs/)
- [Fluxo Financeiro](./docs/financial-flow.md)
- [Checkout](./docs/checkout.md)
- [Integração de Pagamentos](./docs/payment-providers.md)
- [Onboarding](./docs/onboarding.md)

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Executar testes em modo watch
npm test -- --watch

# Executar testes com cobertura
npm test -- --coverage
```

## 🏗️ Arquitetura

Este projeto segue a **Arquitetura Hexagonal** (Ports & Adapters):

- **Domain**: Entidades e regras de negócio puras (sem dependências externas)
- **Application**: Casos de uso e serviços de aplicação
- **Ports**: Interfaces/contratos (repositórios, serviços externos)
- **Infrastructure**: Implementações concretas (Prisma, Express, RabbitMQ, etc.)

### Princípios

- ✅ Domain não importa nada externo
- ✅ Application só importa Domain + Ports
- ✅ Infrastructure implementa Ports e expõe HTTP/messaging
- ✅ Type-safety completo (TypeScript strict)
- ✅ Validação em múltiplas camadas (Zod + Domain)

## 📦 Deploy

### EasyPanel

1. Crie um novo projeto no EasyPanel
2. Configure deploy via Dockerfile
3. Defina as variáveis de ambiente
4. O Dockerfile já inclui:
   - Build multi-stage otimizado
   - Prisma Client generation
   - Migrations automáticas no startup
   - Healthcheck configurado

### Outros Provedores

O Dockerfile é compatível com qualquer plataforma que suporte Docker:
- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Instances
- Railway
- Render
- Fly.io

## 🔒 Segurança

- Validação de inputs com Zod
- Autenticação JWT
- Rate limiting
- CORS configurável
- Helmet.js para headers de segurança
- Sanitização de dados
- Logs estruturados

## 📝 Licença

ISC

## 👥 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

