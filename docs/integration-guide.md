# 📘 Guia de Integração - Gateway Turbofy

Este guia explica como integrar seu sistema com o Gateway Turbofy para gerar cobranças Pix e receber notificações via webhooks.

---

## 🎯 Visão Geral

O Turbofy oferece uma API REST para integradores criarem cobranças Pix e receberem notificações de pagamento. A integração é **server-to-server** (backend do integrador → API Turbofy).

---

## 🔑 Autenticação

### Credenciais

Para usar a API, você precisa de:
- **Client ID**: Identificador único do seu merchant
- **Client Secret**: Chave secreta para autenticação

**⚠️ IMPORTANTE:** Nunca exponha o `Client Secret` no frontend/browser. Use apenas em chamadas server-to-server.

### Headers Obrigatórios

Todas as requisições devem incluir:

```
x-client-id: <SEU_CLIENT_ID>
x-client-secret: <SEU_CLIENT_SECRET>
Content-Type: application/json
```

### Header Opcional (Recomendado)

```
x-idempotency-key: <chave-unica-por-pedido>
```

**Por que usar?** Se você repetir a mesma chave, o Turbofy retorna a **mesma cobrança** (evita cobrança duplicada). Use uma chave estável por pedido (ex.: `order_123`, `checkout_abc`).

---

## 💰 Criar Cobrança Pix

### Endpoint

```
POST /rifeiro/pix
```

### Request Body

```json
{
  "amountCents": 50000,
  "description": "Pedido #1234",
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "externalRef": "order:1234",
  "metadata": {
    "customerId": "cus_abc",
    "orderId": "1234"
  }
}
```

**Campos:**
- `amountCents` (**obrigatório**): Valor em centavos (ex.: `50000` = R$ 500,00)
- `description` (opcional): Descrição da cobrança
- `expiresAt` (opcional): Data de expiração do QR Code (ISO 8601)
- `externalRef` (opcional): Referência externa do pedido
- `metadata` (opcional): Objeto livre com dados adicionais (não coloque segredos)

### Response (201 Created)

```json
{
  "id": "1cec00cd-8778-4cdc-903d-8b950d6713ec",
  "status": "PENDING",
  "amountCents": 50000,
  "description": "Pedido #1234",
  "pix": {
    "qrCode": "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",
    "copyPaste": "00020126840014br.gov.bcb.pix2562qrcode.transfeera.com/cob/89202e7c-e7e3-4c22-aa06-0c104d0f17c35204000053039865802BR5925SS OFICIAL AGENCIA DIGITA6011BRASILIA DF62070503***6304FD1D",
    "expiresAt": "2025-12-13T20:39:12.535Z"
  },
  "createdAt": "2025-12-13T20:39:10.766Z"
}
```

### Campos da Resposta

- **`id`**: ID único da cobrança (use para consultar status depois)
- **`status`**: Status atual (`PENDING`, `PAID`, `EXPIRED`)
- **`amountCents`**: Valor em centavos
- **`pix.qrCode`**: **Imagem PNG em Base64** do QR Code
- **`pix.copyPaste`**: String "copia e cola" do Pix
- **`pix.expiresAt`**: Data de expiração do QR Code

---

## 🖼️ Renderizar QR Code

O campo `pix.qrCode` retorna uma **imagem PNG codificada em Base64**. Use uma das opções abaixo:

### React/Next.js

```tsx
import { useState, useEffect } from 'react';

function PixCheckout() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copyPaste, setCopyPaste] = useState<string>('');

  useEffect(() => {
    // Criar cobrança
    fetch('https://api.turbofy.com/rifeiro/pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.NEXT_PUBLIC_CLIENT_ID!,
        'x-client-secret': process.env.NEXT_PUBLIC_CLIENT_SECRET!, // ⚠️ NUNCA faça isso no frontend!
      },
      body: JSON.stringify({
        amountCents: 50000,
        description: 'Pedido #1234',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setQrCode(data.pix.qrCode);
        setCopyPaste(data.pix.copyPaste);
      });
  }, []);

  if (!qrCode) return <div>Carregando...</div>;

  return (
    <div>
      <img 
        src={`data:image/png;base64,${qrCode}`} 
        alt="QR Code Pix"
        style={{ width: '256px', height: '256px' }}
      />
      <input 
        type="text" 
        value={copyPaste} 
        readOnly 
        onClick={(e) => e.currentTarget.select()}
      />
    </div>
  );
}
```

### JavaScript/HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>Checkout Pix</title>
</head>
<body>
  <div id="qr-code"></div>
  <input type="text" id="copy-paste" readonly />

  <script>
    async function createPixCharge() {
      const response = await fetch('https://api.turbofy.com/rifeiro/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': 'SEU_CLIENT_ID',
          'x-client-secret': 'SEU_CLIENT_SECRET',
        },
        body: JSON.stringify({
          amountCents: 50000,
          description: 'Pedido #1234',
        }),
      });

      const data = await response.json();

      // Renderizar QR Code
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${data.pix.qrCode}`;
      img.alt = 'QR Code Pix';
      img.style.width = '256px';
      img.style.height = '256px';
      document.getElementById('qr-code').appendChild(img);

      // Exibir "copia e cola"
      document.getElementById('copy-paste').value = data.pix.copyPaste;
    }

    createPixCharge();
  </script>
</body>
</html>
```

### Node.js (Backend)

```typescript
import axios from 'axios';

interface PixResponse {
  id: string;
  status: string;
  amountCents: number;
  pix: {
    qrCode: string; // Base64 PNG
    copyPaste: string;
    expiresAt: string;
  };
}

async function createPixCharge(): Promise<PixResponse> {
  const response = await axios.post(
    'https://api.turbofy.com/rifeiro/pix',
    {
      amountCents: 50000,
      description: 'Pedido #1234',
      externalRef: 'order:1234',
    },
    {
      headers: {
        'x-client-id': process.env.TURBOFY_CLIENT_ID!,
        'x-client-secret': process.env.TURBOFY_CLIENT_SECRET!,
        'x-idempotency-key': `order_${Date.now()}`,
      },
    }
  );

  return response.data;
}

// Usar
const pixData = await createPixCharge();
console.log('QR Code (Base64):', pixData.pix.qrCode);
console.log('Pix Copia e Cola:', pixData.pix.copyPaste);

// Enviar para o frontend (exemplo com Express)
app.post('/api/checkout/pix', async (req, res) => {
  const pixData = await createPixCharge();
  res.json({
    qrCodeImage: `data:image/png;base64,${pixData.pix.qrCode}`,
    copyPaste: pixData.pix.copyPaste,
    chargeId: pixData.id,
  });
});
```

---

## 📊 Consultar Status da Cobrança

### Endpoint

```
GET /rifeiro/pix/:id
```

### Headers

```
x-client-id: <SEU_CLIENT_ID>
x-client-secret: <SEU_CLIENT_SECRET>
```

### Response (200 OK)

```json
{
  "id": "1cec00cd-8778-4cdc-903d-8b950d6713ec",
  "status": "PAID",
  "amountCents": 50000,
  "description": "Pedido #1234",
  "pix": {
    "qrCode": "...",
    "copyPaste": "...",
    "expiresAt": "2025-12-13T20:39:12.535Z"
  },
  "paidAt": "2025-12-13T20:40:00.000Z",
  "createdAt": "2025-12-13T20:39:10.766Z",
  "updatedAt": "2025-12-13T20:40:00.000Z"
}
```

**Status possíveis:**
- `PENDING`: Aguardando pagamento
- `PAID`: Pagamento confirmado
- `EXPIRED`: QR Code expirado

---

## 🔔 Webhooks (Notificações)

O Turbofy pode enviar notificações para sua URL quando o status da cobrança mudar (ex.: `charge.paid`, `charge.expired`).

### Configurar Webhook

**Endpoint:** `POST /webhooks` (requer autenticação)

```json
{
  "url": "https://seu-site.com/webhooks/turbofy",
  "events": ["charge.paid", "charge.expired"]
}
```

### Validar Assinatura

Todas as notificações incluem o header `turbofy-signature`:

```
turbofy-signature: t=1580306324381,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

**Validação (Node.js):**

```typescript
import crypto from 'crypto';

function validateWebhookSignature(
  signature: string,
  rawBody: string,
  secret: string
): boolean {
  const parts = signature.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.split('=')[1];
  const receivedSignature = parts.find((p) => p.startsWith('v1='))?.split('=')[1];

  if (!timestamp || !receivedSignature) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return computedSignature === receivedSignature;
}

// Exemplo com Express
app.post('/webhooks/turbofy', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['turbofy-signature'] as string;
  const rawBody = req.body.toString();

  if (!validateWebhookSignature(signature, rawBody, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody);
  console.log('Webhook recebido:', payload);

  // Processar evento
  if (payload.type === 'charge.paid') {
    // Atualizar pedido como pago
  }

  res.status(200).json({ received: true });
});
```

---

## ⚠️ Erros Comuns

### 401 Unauthorized

- Verifique se `x-client-id` e `x-client-secret` estão corretos
- Certifique-se de que as credenciais pertencem a um merchant ativo

### 400 Bad Request

- Valide o formato do JSON
- Verifique se `amountCents` é um número positivo
- Confirme que `expiresAt` está no formato ISO 8601

### 500 Internal Server Error

- Entre em contato com o suporte Turbofy
- Inclua o `traceId` (se disponível) na mensagem de erro

---

## 📚 Exemplos Completos

### cURL

```bash
curl -X POST "https://api.turbofy.com/rifeiro/pix" \
  -H "Content-Type: application/json" \
  -H "x-client-id: rf_f4d126b0-9f5d-493e-802f-538ceff00b58" \
  -H "x-client-secret: 61b3ca9d-5371-42ee-876c-2a1e0701e6ef" \
  -H "x-idempotency-key: order_1234" \
  --data '{
    "amountCents": 50000,
    "description": "Pedido #1234",
    "externalRef": "order:1234",
    "metadata": {
      "customerId": "cus_abc"
    }
  }'
```

### Python

```python
import requests
import os

def create_pix_charge(amount_cents: int, description: str):
    url = "https://api.turbofy.com/rifeiro/pix"
    headers = {
        "Content-Type": "application/json",
        "x-client-id": os.getenv("TURBOFY_CLIENT_ID"),
        "x-client-secret": os.getenv("TURBOFY_CLIENT_SECRET"),
        "x-idempotency-key": f"order_{os.urandom(8).hex()}",
    }
    data = {
        "amountCents": amount_cents,
        "description": description,
        "externalRef": f"order:{os.urandom(8).hex()}",
    }
    
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    return response.json()

# Usar
pix_data = create_pix_charge(50000, "Pedido #1234")
print(f"QR Code: data:image/png;base64,{pix_data['pix']['qrCode']}")
print(f"Pix Copia e Cola: {pix_data['pix']['copyPaste']}")
```

---

## 🎯 Próximos Passos

1. **Obter credenciais**: Entre em contato com o suporte Turbofy para receber seu `Client ID` e `Client Secret`
2. **Testar integração**: Use o ambiente de desenvolvimento (`http://localhost:3000`) para testar
3. **Configurar webhooks**: Configure URLs para receber notificações de pagamento
4. **Implementar retry**: Adicione lógica de retry para chamadas de API
5. **Monitorar logs**: Acompanhe logs e métricas da integração

---

## 📞 Suporte

Para dúvidas ou problemas:
- **Email**: suporte@turbofy.com
- **Documentação**: https://docs.turbofy.com
- **Status**: https://status.turbofy.com
