# 🔔 Configure seu Webhook para Receber Eventos de Pagamento

**OBRIGATÓRIO:** Para receber notificações quando um Pix for pago, você **PRECISA** configurar um webhook.

---

## ✅ Passo 1: Criar o Webhook

Execute este comando substituindo suas credenciais:

```bash
curl -X POST "https://api.turbofypay.com/integrations/webhooks" \
  -H "Content-Type: application/json" \
  -H "x-client-id: SEU_CLIENT_ID" \
  -H "x-client-secret: SEU_CLIENT_SECRET" \
  --data '{
    "name": "Meu Webhook de Pagamentos",
    "url": "https://SEU-SITE.COM/webhooks/turbofy",
    "events": ["charge.paid", "charge.expired"]
  }'
```

**Resposta:**
```json
{
  "id": "wh_abc123",
  "secret": "whsec_5d55729305b197168018fcff...",
  "status": "ACTIVE"
}
```

⚠️ **GUARDE O SECRET!** Ele só aparece na criação.

---

## ✅ Passo 2: Implementar Endpoint no seu Servidor

Crie um endpoint POST no seu servidor que:

### Express.js (Node.js)

```typescript
import express from 'express';
import crypto from 'crypto';

const app = express();

// IMPORTANTE: Use express.raw() para este endpoint
app.post('/webhooks/turbofy', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['turbofy-signature'] as string;
  const rawBody = req.body.toString();
  const secret = process.env.TURBOFY_WEBHOOK_SECRET!; // O secret da criação

  // Validar assinatura
  if (!validateSignature(signature, rawBody, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody);

  // Processar evento
  if (payload.type === 'charge.paid') {
    console.log('✅ Pagamento confirmado!');
    console.log('Cobrança ID:', payload.data.chargeId);
    console.log('Valor:', payload.data.amountCents / 100, 'BRL');
    console.log('Referência:', payload.data.externalRef);
    
    // TODO: Atualizar seu banco de dados / liberar acesso
  }

  // SEMPRE retorne 200
  res.status(200).json({ received: true });
});

function validateSignature(signature: string, rawBody: string, secret: string): boolean {
  if (!signature) return false;
  
  const [tPart, v1Part] = signature.split(',');
  const timestamp = tPart?.split('=')[1];
  const receivedSig = v1Part?.split('=')[1];
  
  if (!timestamp || !receivedSig) return false;
  
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  
  return expectedSig === receivedSig;
}
```

### Python (Flask)

```python
import hmac
import hashlib
from flask import Flask, request, jsonify

app = Flask(__name__)
WEBHOOK_SECRET = "whsec_..."  # O secret da criação

@app.route('/webhooks/turbofy', methods=['POST'])
def webhook():
    signature = request.headers.get('turbofy-signature', '')
    raw_body = request.data.decode('utf-8')
    
    if not validate_signature(signature, raw_body, WEBHOOK_SECRET):
        return jsonify({'error': 'Invalid signature'}), 401
    
    payload = request.get_json(force=True)
    
    if payload.get('type') == 'charge.paid':
        print('✅ Pagamento confirmado!')
        print('Cobrança ID:', payload['data']['chargeId'])
        print('Valor:', payload['data']['amountCents'] / 100, 'BRL')
        # TODO: Atualizar banco de dados
    
    return jsonify({'received': True}), 200

def validate_signature(signature, raw_body, secret):
    if not signature:
        return False
    
    parts = signature.split(',')
    timestamp = parts[0].split('=')[1] if '=' in parts[0] else None
    received_sig = parts[1].split('=')[1] if len(parts) > 1 and '=' in parts[1] else None
    
    if not timestamp or not received_sig:
        return False
    
    signed_payload = f"{timestamp}.{raw_body}"
    expected_sig = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    
    return hmac.compare_digest(expected_sig, received_sig)
```

---

## ✅ Passo 3: Testar

1. **Testar endpoint**: Envie um evento de teste:
   ```bash
   curl -X POST "https://api.turbofypay.com/integrations/webhooks/wh_abc123/test" \
     -H "x-client-id: SEU_CLIENT_ID" \
     -H "x-client-secret: SEU_CLIENT_SECRET"
   ```

2. **Verificar logs**: Confirme que seu servidor recebeu e processou o evento.

---

## 📋 Eventos Disponíveis

| Evento | Quando é enviado |
|--------|------------------|
| `charge.paid` | ✅ Pagamento Pix confirmado |
| `charge.expired` | Pix expirou sem pagamento |
| `charge.created` | Cobrança criada |

---

## 🔍 Troubleshooting

### Não estou recebendo eventos

1. **Webhook criado?** Execute:
   ```bash
   curl -X GET "https://api.turbofypay.com/integrations/webhooks" \
     -H "x-client-id: SEU_CLIENT_ID" \
     -H "x-client-secret: SEU_CLIENT_SECRET"
   ```
   Se retornar lista vazia, crie o webhook (Passo 1).

2. **URL acessível?** Sua URL deve:
   - Usar HTTPS (obrigatório em produção)
   - Responder em menos de 30 segundos
   - Retornar status 200

3. **Firewall?** Permita requisições de IPs da Turbofy.

### Assinatura inválida

1. Use o **secret correto** (retornado na criação do webhook)
2. Use o **raw body** (sem parse JSON antes)
3. Verifique se não há modificação do payload

---

## 📞 Suporte

- **Email**: suporte@turbofy.com
- **Documentação completa**: https://docs.turbofy.com
