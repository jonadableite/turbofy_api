# Checklist de Deploy - Correção de Wallet e Métricas

## Pré-Deploy

### Backend
- [x] Build passou: `pnpm build`
- [x] Testes unitários: (não executados - produção)
- [x] Linter: sem erros críticos

### Frontend  
- [ ] Build passou: `pnpm build` (não testado completamente)
- [ ] Linter: warnings não-críticos apenas

## Deploy

### 1. Backend (turbofy_api)

```bash
cd turbofy_api
git status
git add .
git commit -m "fix: wallet creditada após pagamento + métricas rifeiro + saques merchant-based"
git push
```

### 2. Frontend (turbofy_front)

```bash
cd turbofy_front
git status
git add .
git commit -m "fix: header com merchantId correto + saques rifeiro com wallet"
git push
```

## Pós-Deploy

### 1. Aguardar Deploy Completo
- Verificar logs de deploy em produção
- Confirmar que API reiniciou com sucesso

### 2. Executar Script de Backfill (OPCIONAL)

Se houver charges antigas sem `paidAt`:

```bash
# No ambiente de produção (via SSH ou equivalente)
cd turbofy_api
npx ts-node scripts/recalculate-wallets.ts
```

**Nota**: O script já rodou localmente e mostrou que não há charges sem `paidAt`.

### 3. Verificar Dashboard

Acessar [https://app.turbofypay.com/rifeiro](https://app.turbofypay.com/rifeiro):

#### Header
- [ ] TurboProgressBar mostra valor correto
- [ ] Badge de tier aparece (se aplicável)
- [ ] Barra de progresso preenchida

#### Cards
- [ ] Splits - Hoje: R$ 4,95
- [ ] Splits - Semana: R$ 4,95
- [ ] Splits - Mês: R$ 4,95
- [ ] Saldo Disponível: R$ 4,95

#### Últimas Transações
- [ ] Transação paga aparece
- [ ] Status: "Pago"
- [ ] Líquido: R$ 4,95

#### Página de Saques
- [ ] Disponível para Saque: R$ 4,95
- [ ] Saques Realizados: (conforme settlements)
- [ ] Total Sacado: (conforme settlements completados)

### 4. Teste End-to-End

#### Criar Nova Cobrança
```bash
curl -X POST "https://api.turbofypay.com/rifeiro/pix" \
  -H "x-client-id: ${CLIENT_ID}" \
  -H "x-client-secret: ${CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"amountCents": 1000, "description": "Teste E2E"}'
```

#### Pagar PIX
1. Copiar QR Code ou copia-e-cola
2. Pagar usando app bancário
3. Aguardar 5-10 segundos

#### Verificar Atualização
1. Recarregar dashboard
2. Verificar:
   - Header: +R$ 9,90
   - Splits - Hoje: R$ 14,85
   - Saldo Disponível: R$ 14,85

#### Solicitar Saque
1. Acessar /rifeiro/saques
2. Clicar "Novo Saque"
3. Inserir R$ 10,00
4. Confirmar
5. Verificar:
   - Settlement criado
   - Saldo Disponível: R$ 4,85
   - Settlement aparece na listagem

## Rollback (se necessário)

Se algum problema crítico ocorrer:

```bash
# Backend
cd turbofy_api
git revert HEAD
git push

# Frontend
cd turbofy_front
git revert HEAD
git push
```

## Contato de Suporte

- Logs da API: Verificar em CloudWatch ou equivalente
- Logs de erros: Filtrar por `[WALLET_CREDIT_FAILED]`, `[METRICS_ERROR]`

---

**Responsável**: Equipe Turbofy
**Data**: 2025-12-22
**Prioridade**: Alta - Correção crítica de métricas financeiras
