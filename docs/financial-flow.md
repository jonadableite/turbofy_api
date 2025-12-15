# Fluxo Financeiro Completo - Turbofy Gateway

## Visão Geral

Implementação completa do fluxo financeiro incluindo criação de cobranças com splits, repasses (settlements) e conciliação bancária (reconciliations), seguindo arquitetura hexagonal.

```mermaid
flowchart LR
    A[POST /charges] -->|CreateCharge| B(Charge)
    B --> C{ChargeSplit}
    B --> D{Fee}
    B -->|status=PAID| E[Settlement]
    E --> F[BankingPort]
    F --> E
    E -->|completed| G[Reconciliation Input]
    G --> H[RunReconciliation]
    H -->|payloads| I[Events turbofy.*]
```

> Para detalhes do checkout público consulte `backend/docs/checkout.md`.

## Entidades de Domínio

### 1. Charge (Cobrança)
- **Localização**: `backend/src/domain/entities/Charge.ts`
- **Funcionalidades**:
  - Criação de cobranças PIX/Boleto
  - Gerenciamento de status (PENDING, PAID, EXPIRED, CANCELED)
  - Suporte a idempotência
  - Metadados e referências externas

### 2. ChargeSplit (Split de Pagamento)
- **Localização**: `backend/src/domain/entities/ChargeSplit.ts`
- **Funcionalidades**:
  - Split por valor fixo (`amountCents`)
  - Split por percentual (`percentage`)
  - Validação de valores
  - Cálculo automático de valores

### 3. Fee (Taxa)
- **Localização**: `backend/src/domain/entities/Fee.ts`
- **Funcionalidades**:
  - Diferentes tipos de taxa (PIX_GATEWAY, BOLETO_EMISSION, PLATFORM_FEE)
  - Aplicação de taxas à cobrança
  - Validação de valores

### 4. Settlement (Repasse)
- **Localização**: `backend/src/domain/entities/Settlement.ts`
- **Funcionalidades**:
  - Agendamento de repasses
  - Processamento de repasses
  - Gerenciamento de status (PENDING, SCHEDULED, PROCESSING, COMPLETED, FAILED, CANCELED)
  - Vinculação com conta bancária
  - Rastreamento de transações

### 5. Reconciliation (Conciliação)
- **Localização**: `backend/src/domain/entities/Reconciliation.ts`
- **Funcionalidades**:
  - Conciliação automática ou manual
  - Matching de charges com transações
  - Identificação de charges não encontradas
  - Identificação de transações não encontradas
  - Cálculo de taxa de match
  - Status (PENDING, PROCESSING, COMPLETED, FAILED, PARTIAL)

## Casos de Uso

### 1. CreateCharge
- **Localização**: `backend/src/application/useCases/CreateCharge.ts`
- **Funcionalidades**:
  - Criação de cobrança com validação
  - Suporte a splits na criação
  - Suporte a fees na criação
  - Idempotência
  - Emissão de PIX/Boleto
  - Publicação de eventos

### 2. ApplySplit
- **Localização**: `backend/src/application/useCases/ApplySplit.ts`
- **Funcionalidades**:
  - Aplicação de splits a charges existentes
  - Validação de splits
  - Publicação de eventos

### 3. CreateSettlement
- **Localização**: `backend/src/application/useCases/CreateSettlement.ts`
- **Funcionalidades**:
  - Criação de settlement
  - Agendamento de repasse
  - Publicação de eventos

### 4. ProcessSettlement
- **Localização**: `backend/src/application/useCases/ProcessSettlement.ts`
- **Funcionalidades**:
  - Processamento de settlement
  - Integração com banking port
  - Atualização de status
  - Publicação de eventos

### 5. RunReconciliation
- **Localização**: `backend/src/application/useCases/RunReconciliation.ts`
- **Funcionalidades**:
  - Execução de conciliação
  - Matching de charges com transações
  - Identificação de não correspondências
  - Publicação de eventos

## Ports (Interfaces)

### 1. ChargeRepository
- **Localização**: `backend/src/ports/ChargeRepository.ts`
- **Métodos**:
  - `findById(id: string): Promise<Charge | null>`
  - `findByIdempotencyKey(idempotencyKey: string): Promise<Charge | null>`
  - `create(charge: Charge): Promise<Charge>`
  - `update(charge: Charge): Promise<Charge>`
  - `addSplit(chargeId: string, split: ChargeSplit): Promise<ChargeSplit>`
  - `addFee(chargeId: string, fee: Fee): Promise<Fee>`

### 2. SettlementRepository
- **Localização**: `backend/src/ports/SettlementRepository.ts`
- **Métodos**:
  - `findById(id: string): Promise<Settlement | null>`
  - `findByMerchantId(merchantId: string, status?: string): Promise<Settlement[]>`
  - `findDueSettlements(): Promise<Settlement[]>`
  - `create(settlement: Settlement): Promise<Settlement>`
  - `update(settlement: Settlement): Promise<Settlement>`

### 3. ReconciliationRepository
- **Localização**: `backend/src/ports/ReconciliationRepository.ts`
- **Métodos**:
  - `findById(id: string): Promise<Reconciliation | null>`
  - `findByMerchantId(merchantId: string, status?: string): Promise<Reconciliation[]>`
  - `findByDateRange(merchantId: string, startDate: Date, endDate: Date): Promise<Reconciliation[]>`
  - `create(reconciliation: Reconciliation): Promise<Reconciliation>`
  - `update(reconciliation: Reconciliation): Promise<Reconciliation>`

### 4. BankingPort
- **Localização**: `backend/src/ports/BankingPort.ts`
- **Métodos**:
  - `processSettlement(request: SettlementRequest): Promise<SettlementResponse>`
  - `getSettlementStatus(transactionId: string): Promise<SettlementResponse>`

## Adapters (Implementações)

### 1. PrismaChargeRepository
- **Localização**: `backend/src/infrastructure/database/PrismaChargeRepository.ts`
- **Implementação**: Prisma ORM para persistência de charges, splits e fees

### 2. PrismaSettlementRepository
- **Localização**: `backend/src/infrastructure/database/PrismaSettlementRepository.ts`
- **Implementação**: Prisma ORM para persistência de settlements

### 3. PrismaReconciliationRepository
- **Localização**: `backend/src/infrastructure/database/PrismaReconciliationRepository.ts`
- **Implementação**: Prisma ORM para persistência de reconciliations

### 4. StubBankingAdapter
- **Localização**: `backend/src/infrastructure/adapters/banking/StubBankingAdapter.ts`
- **Implementação**: Stub para desenvolvimento (substituir por implementação real em produção)

## Rotas HTTP

### 1. POST /charges
- **Criação de cobrança com splits e fees**
- **Headers**: `X-Idempotency-Key` (obrigatório)
- **Body**:
  ```json
  {
    "merchantId": "uuid",
    "amountCents": 10000,
    "currency": "BRL",
    "description": "Descrição",
    "method": "PIX",
    "expiresAt": "2024-12-31T23:59:59Z",
    "idempotencyKey": "unique-key",
    "externalRef": "ref-123",
    "metadata": {},
    "splits": [
      {
        "merchantId": "uuid",
        "amountCents": 5000
      },
      {
        "merchantId": "uuid",
        "percentage": 30
      }
    ],
    "fees": [
      {
        "type": "PIX_GATEWAY",
        "amountCents": 100
      }
    ]
  }
  ```

### 2. POST /settlements
- **Criação de settlement (repasse)**
- **Body**:
  ```json
  {
    "merchantId": "uuid",
    "amountCents": 10000,
    "currency": "BRL",
    "bankAccountId": "uuid",
    "scheduledFor": "2024-12-31T23:59:59Z",
    "metadata": {}
  }
  ```

### 3. POST /settlements/:id/process
- **Processamento de settlement**
- **Params**: `id` (settlement ID)

### 4. POST /reconciliations
- **Execução de conciliação**
- **Body**:
  ```json
  {
    "merchantId": "uuid",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z",
    "type": "AUTOMATIC",
    "metadata": {}
  }
  ```

## Schemas Zod

### 1. CreateChargeRequestSchema
- **Localização**: `backend/src/infrastructure/http/schemas/charges.ts`
- **Validações**:
  - UUIDs válidos
  - Valores positivos
  - Splits válidos (amountCents ou percentage)
  - Fees válidas

### 2. CreateSettlementRequestSchema
- **Localização**: `backend/src/infrastructure/http/schemas/settlements.ts`
- **Validações**:
  - UUIDs válidos
  - Valores positivos
  - Datas válidas

### 3. CreateReconciliationRequestSchema
- **Localização**: `backend/src/infrastructure/http/schemas/reconciliations.ts`
- **Validações**:
  - UUIDs válidos
  - Datas válidas
  - End date após start date

## Eventos Publicados

### 1. charge.created
- **Routing Key**: `turbofy.payments.charge.created`
- **Payload**: Dados da cobrança criada

### 2. charge.split.created
- **Routing Key**: `turbofy.payments.charge.split.created`
- **Payload**: Dados do split criado

### 3. settlement.created
- **Routing Key**: `turbofy.billing.settlement.created`
- **Payload**: Dados do settlement criado

### 4. settlement.processed
- **Routing Key**: `turbofy.billing.settlement.processed`
- **Payload**: Dados do settlement processado

### 5. reconciliation.completed
- **Routing Key**: `turbofy.reconciliation.completed`
- **Payload**: Dados da conciliação completada

## Banco de Dados

### Models Adicionados

#### Settlement
- `id`: UUID
- `merchantId`: UUID
- `amountCents`: Int
- `currency`: String (default: "BRL")
- `status`: SettlementStatus enum
- `scheduledFor`: DateTime?
- `processedAt`: DateTime?
- `bankAccountId`: String?
- `transactionId`: String?
- `failureReason`: String?
- `metadata`: Json?

#### Reconciliation
- `id`: UUID
- `merchantId`: UUID
- `type`: ReconciliationType enum
- `status`: ReconciliationStatus enum
- `startDate`: DateTime
- `endDate`: DateTime
- `matches`: Json? (array de ReconciliationMatch)
- `unmatchedCharges`: String[] (array de charge IDs)
- `unmatchedTransactions`: String[] (array de transaction IDs)
- `totalAmountCents`: Int
- `matchedAmountCents`: Int
- `failureReason`: String?
- `processedAt`: DateTime?
- `metadata`: Json?

## Próximos Passos

1. **Gerar Migration do Prisma**:
   ```bash
   pnpm --filter backend prisma migrate dev --name add_settlements_and_reconciliations
   ```

2. **Gerar Prisma Client**:
   ```bash
   pnpm --filter backend prisma generate
   ```

3. **Criar Testes**:
   - Testes unitários para entidades
   - Testes de integração para casos de uso
   - Testes de rotas HTTP

4. **Implementar BankingPort Real**:
   - Substituir StubBankingAdapter por implementação real
   - Integração com API bancária

5. **Implementar Lógica de Conciliação Completa**:
   - Buscar charges do banco de dados
   - Buscar transações do sistema bancário
   - Algoritmo de matching
   - Tratamento de não correspondências

6. **Atualizar Swagger**:
   - Documentar novos endpoints
   - Adicionar exemplos de requisições/respostas

## Validações Implementadas

### Domain Layer
- Validação de valores positivos
- Validação de percentuais (0-100)
- Validação de datas
- Validação de estados de transição
- Validação de splits não excederem valor total
- Validação de fees não excederem valor total

### Application Layer
- Validação de idempotência
- Validação de existência de entidades
- Validação de regras de negócio
- Validação de estados para operações

### Infrastructure Layer
- Validação de schemas Zod
- Validação de tipos TypeScript
- Validação de headers HTTP
- Validação de parâmetros de rota

## Segurança

- ✅ Validação de inputs com Zod
- ✅ Type-safe em todas as camadas
- ✅ Idempotência em operações críticas
- ✅ Logs estruturados
- ✅ Tratamento de erros adequado
- ✅ Headers de segurança (Helmet)
- ✅ Rate limiting
- ✅ CORS configurado

## Observabilidade

- ✅ Logs estruturados (Pino)
- ✅ Eventos publicados (RabbitMQ)
- ✅ Rastreamento de operações (traceId)
- ✅ Métricas de negócio (splits, fees, settlements)

---

**Última atualização**: 2024  
**Versão**: 1.0.0

