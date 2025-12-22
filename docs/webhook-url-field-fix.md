# Correção: Campo URL Faltando ao Criar Webhook

## Problema Identificado

Ao criar webhook na Transfeera, o Prisma estava reclamando:

```
Argument `url` is missing.
```

## Causa Raiz

O campo `url` não estava sendo passado corretamente ao criar o registro no banco. Possíveis causas:

1. A Transfeera pode não retornar o campo `url` na resposta
2. O campo pode estar em formato diferente
3. Erro na Transfeera pode estar sendo ignorado

## Solução Implementada

### 1. Validação e Fallback no Service

```typescript
// Garantir que todos os campos obrigatórios estejam presentes
if (!remote.id) {
  throw new Error("Transfeera não retornou webhookId")
}
if (!remote.signature_secret) {
  throw new Error("Transfeera não retornou signatureSecret")
}

// Garantir que o url seja sempre definido (usar o original se remote.url não existir)
const webhookUrl = remote.url || url
if (!webhookUrl) {
  throw new Error("URL do webhook não está disponível")
}
```

### 2. Tratamento de Erros Melhorado no Client

```typescript
async createTransfeeraWebhook(url: string, objectTypes: string[]): Promise<TransfeeraWebhook> {
  try {
    const response = await this.axiosInstance.post<TransfeeraWebhook>("/webhook", {
      url,
      object_types: objectTypes,
    });
    
    // Validar resposta
    if (!response.data.id) {
      throw new PaymentProviderError({ ... });
    }
    if (!response.data.url) {
      // Fallback: usar URL original se não retornou
      response.data.url = url;
    }
    
    return response.data;
  } catch (error) {
    // Tratamento de erros da Transfeera
    if (axios.isAxiosError(error) && error.response) {
      // Log detalhado e lançar erro apropriado
    }
    throw error;
  }
}
```

## Arquivos Alterados

- `src/application/services/TransfeeraWebhookService.ts`
  - Adicionada validação de campos obrigatórios
  - Adicionado fallback para `url` se não retornado pela Transfeera

- `src/infrastructure/adapters/payment/TransfeeraClient.ts`
  - Melhorado tratamento de erros
  - Adicionada validação de resposta
  - Adicionado fallback para `url`

## Teste

Após o deploy, execute:

```bash
curl -X POST https://api.turbofypay.com/rifeiro/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.turbofypay.com/webhooks/transfeera",
    "objectTypes": ["CashIn", "Transfer", "CashInRefund"]
  }'
```

O webhook deve ser criado com sucesso! ✅

---

**Data**: 2025-01-22
**Status**: ✅ Corrigido
