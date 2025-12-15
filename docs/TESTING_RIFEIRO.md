# Guia de Testes: Fluxo Rifeiro End-to-End

Este documento descreve como executar testes completos do fluxo Rifeiro, incluindo testes automatizados e validação manual.

## 📋 Pré-requisitos

- Banco de dados PostgreSQL rodando e configurado
- Variáveis de ambiente configuradas (`.env`)
- Dependências instaladas (`pnpm install`)

## 🧪 Testes Automatizados

### Testes Unitários

```bash
# Executar todos os testes unitários relacionados ao Rifeiro
pnpm test RifeiroSplitCalculator
pnpm test FeeCalculator
```

### Testes de Integração

```bash
# Executar teste de integração completo
pnpm test rifeiro-integration
```

O teste de integração valida:
- ✅ Criação de Rifeiro e Producer
- ✅ Associação de Rifeiro ao Producer com porcentagem
- ✅ Cálculo automático de splits e taxas
- ✅ Criação de cobrança PIX
- ✅ Processamento de webhook de pagamento
- ✅ Preservação de splits e taxas após pagamento

## 🔧 Teste Manual (Script)

Execute o script de validação manual para testar o fluxo completo:

```bash
pnpm test:rifeiro:manual
```

O script executa os seguintes passos:

1. **Criar Rifeiro**: Cria um merchant do tipo RIFEIRO
2. **Gerar Credenciais**: Gera Client ID e Client Secret
3. **Criar Producer**: Cria um merchant do tipo PRODUCER
4. **Associar Rifeiro**: Associa o Rifeiro ao Producer com 10% de comissão
5. **Criar Cobrança PIX**: Cria uma cobrança de R$100,00 via CreateCharge
6. **Verificar Splits**: Valida que o split foi calculado corretamente (R$9,97)
7. **Verificar Taxas**: Valida que a taxa foi calculada corretamente (R$1,03)
8. **Simular Webhook**: Marca a cobrança como paga e verifica preservação

### Exemplo de Saída

```
============================================================
  TESTE MANUAL: Fluxo Rifeiro End-to-End
============================================================

→ PASSO 1: Criando Rifeiro...
✓ Rifeiro criado: abc123...
ℹ Documento: 1234567890123

→ PASSO 2: Gerando credenciais para Rifeiro...
✓ Credenciais geradas:
ℹ Client ID: rf_xyz789...
ℹ Client Secret: secret123...

→ PASSO 3: Criando Producer...
✓ Producer criado: def456...

→ PASSO 4: Associando Rifeiro ao Producer (10% de comissão)...
✓ Rifeiro associado ao Producer:
ℹ Affiliate ID: aff789...
ℹ Comissão: 10%
ℹ Bloqueado: Sim

→ PASSO 5: Criando cobrança PIX via CreateCharge...
✓ Cobrança criada: charge123...
ℹ Valor: R$ 100.00
ℹ Status: PENDING

→ PASSO 6: Verificando splits e taxas calculados...
✓ Split calculado:
ℹ   Merchant ID: def456...
ℹ   Porcentagem: 10%
ℹ   Valor: R$ 9.97
✓ Valor do split correto: R$ 9.97
✓ Taxa calculada:
ℹ   Tipo: TURBOFY_SERVICE_FEE
ℹ   Valor: R$ 1.03
✓ Valor da taxa correto: R$ 1.03

→ PASSO 7: Verificando persistência no banco de dados...
✓ Cobrança persistida no banco:
ℹ   Splits: 1
ℹ   Taxas: 1

→ PASSO 8: Simulando webhook de pagamento...
✓ Cobrança marcada como paga:
ℹ   Status: PAID
ℹ   Splits preservados: 1
ℹ   Taxas preservadas: 1
✓ Splits e taxas preservados corretamente após pagamento!

============================================================
  RESUMO DO TESTE
============================================================
✓ Rifeiro criado: abc123...
✓ Producer criado: def456...
✓ Rifeiro associado ao Producer (10% comissão)
✓ Cobrança PIX criada: charge123...
✓ Split calculado: R$ 9.97
✓ Taxa calculada: R$ 1.03
✓ Webhook processado: Status PAID
✓ Splits e taxas preservados após pagamento
============================================================

✅ TODOS OS TESTES PASSARAM!
```

## 📊 Validações Realizadas

### Cálculo de Splits

- **Entrada**: R$100,00 com 10% de comissão
- **Cálculo**: 10% de R$100 = R$10,00 - R$0,03 = **R$9,97**
- **Validação**: Split deve ser exatamente 997 centavos

### Cálculo de Taxas

- **Entrada**: R$100,00 com 1 split
- **Cálculo**: 1% de R$100 + R$0,03 = R$1,00 + R$0,03 = **R$1,03**
- **Validação**: Taxa deve ser exatamente 103 centavos

### Preservação após Pagamento

- Splits devem ser preservados quando a cobrança é marcada como paga
- Taxas devem ser preservadas quando a cobrança é marcada como paga
- Status da cobrança deve mudar para `PAID`

## 🔍 Testes Adicionais

### Teste com Múltiplos Producers

O teste de integração também valida o cenário com múltiplos Producers associados:

- Producer 1: 10% de comissão → Split: R$9,97
- Producer 2: 5% de comissão → Split: R$4,97
- Taxa: 1% + (R$0,03 × 2) = R$1,06

### Teste sem Associados

Valida que quando não há Producers associados:
- Nenhum split é criado
- Apenas taxa de 1% é aplicada (R$1,00)

## 🐛 Troubleshooting

### Erro: "Charge not found"

- Verifique se o banco de dados está rodando
- Verifique se as migrações foram executadas (`pnpm prisma:migrate`)

### Erro: "Affiliate está bloqueado"

- O affiliate foi criado com `locked: true`
- Isso é esperado e valida que affiliates bloqueados não podem ser editados

### Erro: "Splits não foram calculados"

- Verifique se o Rifeiro tem documento cadastrado
- Verifique se há Producers associados ao Rifeiro pelo documento
- Verifique se as commission rules estão ativas

## 📝 Notas

- O script de teste manual limpa automaticamente os dados criados após a execução
- Em caso de erro, o script tenta limpar os dados antes de encerrar
- Todos os dados de teste usam emails com sufixo `@test-manual.com` para fácil identificação

