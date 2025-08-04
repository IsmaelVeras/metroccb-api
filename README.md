# 🚇 Metro Stations & Churches API

> Uma API REST completa para gerenciar estações de metrô/trem e igrejas próximas, com sistema de autenticação JWT e timeline de ações dos usuários.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.7+-orange.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-black.svg)](https://expressjs.com/)
[![JWT](https://img.shields.io/badge/JWT-Auth-red.svg)](https://jwt.io/)

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Endpoints da API](#-endpoints-da-api)
- [Autenticação](#-autenticação)
- [Exemplos](#-exemplos)
- [Contribuição](#-contribuição)

## 🎯 Visão Geral

Esta API foi desenvolvida para gerenciar informações sobre estações de transporte público (Metro, CPTM, Via Quatro, etc.) e igrejas/locais de culto próximos a essas estações. O sistema inclui autenticação JWT, timeline de ações dos usuários e funcionalidades completas de CRUD.

### 🌟 Funcionalidades

- ✅ **Autenticação JWT** - Sistema completo de registro, login e proteção de rotas
- ✅ **Gerenciamento de Usuários** - CRUD completo com timeline de ações
- ✅ **Gerenciamento de Estações** - Suporte para diferentes tipos de transporte
- ✅ **Gerenciamento de Igrejas** - Locais de culto próximos às estações
- ✅ **Busca Avançada** - Filtros por tipo, linha, nome e localização
- ✅ **Paginação** - Todas as listagens com paginação
- ✅ **Validação** - Validação robusta com Zod
- ✅ **Segurança** - Helmet, CORS, Rate Limiting
- ✅ **Timeline** - Histórico de ações dos usuários
- ✅ **Estatísticas** - Dashboards com dados agregados

### 🛠 Tecnologias

- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL com Prisma ORM
- **Autenticação:** JWT (JSON Web Tokens)
- **Validação:** Zod
- **Segurança:** Helmet, CORS, bcrypt, express-rate-limit
- **Desenvolvimento:** tsx (hot reload), ESLint, Prettier

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+
- PostgreSQL 13+
- pnpm, npm ou yarn

### Passo a passo

1. **Clone o repositório:**
```bash
git clone https://github.com/IsmaelVeras/metroccb-api.git
cd metroccb-api
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**
```bash
cp .env.example .env
```

4. **Configure o banco de dados:**
```bash
# Execute as migrações
npm run prisma:migrate

# Gere o cliente Prisma
npm run prisma:generate
```

5. **Inicie o servidor:**
```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`:

```env
# Database
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco"

# JWT Secret (use um valor seguro em produção)
JWT_SECRET="seu-jwt-secret-aqui"

# Server
PORT=3000
NODE_ENV=development

# Frontend URL (para CORS)
FRONTEND_URL="http://localhost:3000"
```

### Schema do Banco de Dados

```prisma
model User {
  id        String   @id @default(uuid())
  name      String
  address   String
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  timeline  UserTimeline[]
}

model Station {
  id            String      @id @default(uuid())
  name          String
  line          String
  type          StationType
  address       String
  openingHours  String
  accessibility String[]
  churches      Location[]
}

model Location {
  id              Int      @id @default(autoincrement())
  name            String
  address         String
  distance        String
  stationId       String
  officialWorship String[]
  youthMeeting    String[]
  station         Station  @relation(fields: [stationId], references: [id])
}

enum StationType {
  METRO
  CPTM
  VIA_QUATRO
  VIA_MOBILIDADE
  MONOTRILHO
}
```

## 🔐 Autenticação

A API utiliza JWT (JSON Web Tokens) para autenticação. Após o login, inclua o token em todas as requisições protegidas:

```
Authorization: Bearer {seu-token-jwt}
```

### Obter Token

1. **Registrar usuário:**
```bash
POST /api/auth/register
```

2. **Fazer login:**
```bash
POST /api/auth/login
```

## 📚 Endpoints da API

### Base URL
```
Local: http://localhost:3000/api
```

### 🔒 Autenticação

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/auth/register` | Registrar novo usuário | ❌ |
| POST | `/auth/login` | Login e obter token | ❌ |

### 👥 Usuários

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | `/users` | Listar usuários | ✅ |
| GET | `/users/:id` | Buscar usuário por ID | ✅ |
| PUT | `/users/:id` | Atualizar usuário | ✅ |
| DELETE | `/users/:id` | Deletar usuário | ✅ |
| GET | `/users/:id/timeline` | Timeline do usuário | ✅ |

### 🚇 Estações

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/stations` | Criar estação | ✅ |
| GET | `/stations` | Listar estações | ❌ |
| GET | `/stations/:id` | Buscar estação por ID | ❌ |
| PUT | `/stations/:id` | Atualizar estação | ✅ |
| DELETE | `/stations/:id` | Deletar estação | ✅ |
| GET | `/stations/types` | Tipos de estação | ❌ |
| GET | `/stations/stats` | Estatísticas | ❌ |

### ⛪ Igrejas/Localizações

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/locations` | Criar igreja | ✅ |
| GET | `/locations` | Listar igrejas | ❌ |
| GET | `/locations/:id` | Buscar igreja por ID | ❌ |
| PUT | `/locations/:id` | Atualizar igreja | ✅ |
| DELETE | `/locations/:id` | Deletar igreja | ✅ |
| GET | `/locations/search` | Buscar igrejas | ❌ |
| GET | `/stations/:stationId/locations` | Igrejas por estação | ❌ |

### 🏥 Sistema

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | `/health` | Health check | ❌ |

## 💡 Exemplos de Uso

### Registrar Usuário

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "address": "Rua das Flores, 123",
    "email": "joao@email.com",
    "password": "123456"
  }'
```

### Fazer Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "password": "123456"
  }'
```

### Criar Estação

```bash
curl -X POST http://localhost:3000/api/stations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Estação Sé",
    "line": "Linha 1 - Azul",
    "type": "METRO",
    "address": "Praça da Sé, s/n",
    "openingHours": "04:40 às 00:00",
    "accessibility": ["Elevador", "Piso tátil"]
  }'
```

### Criar Igreja

```bash
curl -X POST http://localhost:3000/api/locations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vila Ré",
    "address": "Rua da Igreja da Vila Ré, 789",
    "distance": "160m",
    "stationId": "uuid-da-estacao",
    "officialWorship": ["Domingo - 18:30 - 20:00", "Quarta - 19:30 - 21:00"],
    "youthMeeting": ["Domingo - 18h"]
  }'
```

### Buscar com Filtros

```bash
# Estações por tipo
curl "http://localhost:3000/api/stations?type=METRO&page=1&limit=10"

# Igrejas por estação
curl "http://localhost:3000/api/locations?stationId=uuid-da-estacao"

# Busca geral
curl "http://localhost:3000/api/locations/search?q=re"
```

### Variáveis de Ambiente para Produção

```env
DATABASE_URL=postgresql://...
JWT_SECRET=production-secret-key
NODE_ENV=production
PORT=3333
```

## 📊 Estrutura do Projeto

```
├── src/
│   ├── controllers/              # Controladores da API
│   │   ├── userController.ts
│   │   ├── stationController.ts
│   │   └── locationController.ts
│   ├── middleware/               # Middlewares
│   │   └── auth.ts
│   ├── routes/                   # Rotas da API
│   │   └── index.ts
│   ├── lib/                      # Configurações
│   │   └── prisma.ts
│   └── server.ts                 # Servidor principal
├── prisma/
│   ├── schema.prisma             # Schema do banco
│   └── migrations/               # Migrações
├── .env.example                  # Exemplo de variáveis
├── package.json
└── README.md
```

## 🧪 Testes

```bash
# Executar testes
npm test

# Testes com coverage
npm run test:coverage

# Testes em modo watch
npm run test:watch
```

## 📝 Scripts Disponíveis

```bash
npm run dev               # Desenvolvimento com hot reload
npm run build             # Build para produção
npm start                 # Iniciar em produção
npm run prisma:generate   # Gerar cliente Prisma
npm run prisma:migrate    # Executar migrações
npm run prisma:studio     # Interface visual do banco
npm run prisma:deploy     # Deploy de migrações
npm run lint              # Executar ESLint
npm run format            # Formatar código com Prettier
```

## 🤝 Contribuição

1. **Fork o projeto**
2. **Crie uma branch:** `git checkout -b feature/nova-funcionalidade`
3. **Commit suas mudanças:** `git commit -m 'Adiciona nova funcionalidade'`
4. **Push para a branch:** `git push origin feature/nova-funcionalidade`
5. **Abra um Pull Request**

### Diretrizes

- Siga os padrões de código existentes
- Adicione testes para novas funcionalidades
- Atualize a documentação quando necessário
- Use commits semânticos

## 🐛 Reportar Bugs

Encontrou um bug? [Abra uma issue](https://github.com/IsmaelVeras/metroccb-api/issues) com:

- Descrição detalhada do problema
- Passos para reproduzir
- Comportamento esperado vs atual
- Screenshots (se aplicável)
- Informações do ambiente

## 📈 Roadmap

- [ ] Autenticação OAuth2
- [ ] Cache com Redis
- [ ] WebSockets para atualizações em tempo real
- [ ] Integração com APIs de mapas
- [ ] Sistema de notificações
- [ ] API Rate Limiting avançado
- [ ] Documentação Swagger/OpenAPI
- [ ] Testes automatizados
- [ ] CI/CD Pipeline
- [ ] Monitoramento e logs

## 👨‍💻 Autor

**Ismael Veras**
- GitHub: [@IsmaelVeras](https://github.com/IsmaelVeras)
- LinkedIn: [Ismael Veras](https://www.linkedin.com/in/ismaelveras/)
- Email: ismaelverass@hotmail.com
