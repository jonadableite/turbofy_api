# Correção: Webhook Já Existe na Transfeera

## Problema Identificado

Ao tentar criar um webhook, a Transfeera retornava erro 400:

```
"You can only have 1 webhook URL per object types"
```

Isso significa que já existe um webhook configurado na Transfeera para os mesmos tipos de objeto (CashIn, Transfer, CashInRefund) e a Transfeera não permite criar outro.

## Causa Raiz

A Transfeera tem uma limitação: **apenas 1 webhook URL por conjunto de objectTypes**. Se tentarmos criar um novo webhook com os mesmos objectTypes, ela rejeita.

## Solução Implementada

### 1. Detecção de Webhook Existente

O código agora:
1. Tenta criar o webhook normalmente
2. Se receber erro 400 com a mensagem sobre limite, detecta que já existe
3. Lista webhooks existentes na Transfeera
4. Encontra o webhook que corresponde aos objectTypes solicitados
5. Atualiza o webhook existente ao invés de criar novo

### 2. Sincronização com Banco de Dados

O código também verifica se o webhook já existe no nosso banco:
- Se existir: atualiza o registro
- Se não existir: cria novo registro

Isso garante que o banco de dados sempre esteja sincronizado com a Transfeera.

## Código Implementado

```typescript
async createWebhook(merchantId: string, url: string, objectTypes: string[]): Promise<WebhookConfigDTO> {
  validateWebhookUrl(url)

  let remote: TransfeeraWebhook
  
  try {
    // Tentar criar novo webhook
    remote = await this.transfeeraClient.createTransfeeraWebhook(url, objectTypes)
  } catch (error) {
    // Se erro 400 sobre limite, tentar atualizar existente
    if (error.message.includes("You can only have 1 webhook URL per object types")) {
      // Listar webhooks existentes
      const existingWebhooks = await this.transfeeraClient.listTransfeeraWebhooks()
      
      // Encontrar webhook correspondente aos objectTypes
      const matchingWebhook = existingWebhooks.find((wh) => {
        const whTypes = (wh.object_types || []).sort()
        const requestedTypes = objectTypes.sort()
        return (
          whTypes.length === requestedTypes.length &&
          whTypes.every((type, idx) => type === requestedTypes[idx])
        )
      })

      if (matchingWebhook) {
        // Atualizar webhook existente
        await this.transfeeraClient.updateTransfeeraWebhook(
          matchingWebhook.id,
          url,
          objectTypes
        )
        
        // Buscar webhook atualizado
        const updatedWebhooks = await this.transfeeraClient.listTransfeeraWebhooks()
        remote = updatedWebhooks.find((wh) => wh.id === matchingWebhook.id)!
      } else {
        throw new Error("Webhook já existe mas não foi possível encontrá-lo")
      }
    } else {
      throw error
    }
  }

  // Verificar se já existe no nosso banco
  const existingInDb = await this.repo.findByWebhookId(remote.id)
  
  if (existingInDb) {
    // Atualizar registro existente
    return mapDto(await this.repo.update(remote.id, { url, objectTypes, active: !remote.deleted_at }))
  } else {
    // Criar novo registro
    return mapDto(await this.repo.create({ merchantId, webhookId: remote.id, ... }))
  }
}
```

## Fluxo Completo

1. **Tentativa de Criação**: Tenta criar webhook na Transfeera
2. **Detecção de Conflito**: Se erro 400 sobre limite, detecta webhook existente
3. **Listagem**: Lista todos os webhooks na Transfeera
4. **Matching**: Encontra webhook com os mesmos objectTypes
5. **Atualização**: Atualiza URL e objectTypes do webhook existente
6. **Sincronização**: Atualiza ou cria registro no banco de dados

## Benefícios

1. ✅ **Não falha mais** quando webhook já existe
2. ✅ **Atualiza automaticamente** webhook existente
3. ✅ **Sincroniza banco de dados** com estado da Transfeera
4. ✅ **Logs informativos** sobre o que está acontecendo
5. ✅ **Idempotente**: pode ser chamado múltiplas vezes com mesmo resultado

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

**Primeira chamada**: Cria webhook novo
**Segunda chamada**: Atualiza webhook existente (não falha mais!)

---

**Data**: 2025-01-22
**Status**: ✅ Corrigido
