# Onboarding e Verificação de Documentos

Este documento descreve o fluxo completo de cadastro, envio de documentos e verificação manual dentro do gateway Turbofy.

## Visão Geral

1. **Produtor envia dados pessoais e endereço** via `/onboarding/personal-data` e `/onboarding/address`.
2. **Documentos obrigatórios** (RG/CNH frente, verso e selfie) são enviados via `/upload/document`.
3. **Conclusão do onboarding** dispara validações automáticas e muda o status para `PENDING_APPROVAL`.
4. **Time de compliance** utiliza os endpoints administrativos para aprovar ou rejeitar o cadastro, com justificativa e notificação automática.

## Upload de Documentos

`POST /upload/document`

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `file` | Multipart (PDF/JPG/PNG) | Sim | Arquivo do documento |
| `type` | string | Sim | `RG_FRONT`, `RG_BACK`, `SELFIE`, etc. |

* Arquivos são armazenados em `./uploads` com nome randômico e URL servida em `/uploads/:filename`.
* Metadados gravados em `MerchantDocument`: tipo, status (`PENDING_REVIEW`), `mimeType`, `fileSize`, timestamps e quem revisou.
* Após upload, o `MerchantProfile.onboardingStep` é ajustado para ≥ 3 automaticamente.

## Fluxo do Produtor

| Endpoint | Método | Descrição |
| --- | --- | --- |
| `/onboarding/status` | GET | Retorna passo atual, status e documentos faltantes |
| `/onboarding/personal-data` | POST | Salva dados pessoais (step ≥ 1) |
| `/onboarding/address` | POST | Salva endereço (step ≥ 2) |
| `/onboarding/complete` | POST | Valida campos obrigatórios + documentos e envia para compliance |

Ao concluir, o perfil fica com `approvalStatus = PENDING_APPROVAL` e os documentos são marcados como `UNDER_REVIEW`.

### Payload do `/onboarding/status`

O endpoint agora retorna, além dos campos tradicionais (`step`, `missingDocuments`, `approvalStatus`), uma estrutura de progresso que reflete exatamente o que o dashboard exibe:

```json
{
  "step": 2,
  "approvalStatus": "PENDING",
  "merchantType": "PRODUCER",
  "missingDocuments": ["SELFIE", "DOCUMENT_FRONT", "DOCUMENT_BACK"],
  "progress": {
    "percent": 50,
    "offerRequirementComplete": false,
    "stages": [
      { "key": "personalData", "label": "Informe seus dados pessoais", "required": true, "complete": true },
      { "key": "address", "label": "Confirme endereço e informações fiscais", "required": true, "complete": true },
      { "key": "documents", "label": "Envie e valide os documentos", "required": true, "complete": false },
      { "key": "compliance", "label": "Aguarde a validação da Turbofy", "required": true, "complete": false },
      { "key": "goLive", "label": "Crie um produto ou afilie-se a uma oferta", "required": true, "complete": false }
    ]
  },
  "documents": [
    {
      "id": "doc-uuid",
      "type": "RG_FRONT",
      "status": "PENDING_REVIEW",
      "url": "https://api.turbofy.com/uploads/rg-front.png",
      "mimeType": "image/png",
      "fileSize": 238472,
      "updatedAt": "2025-02-01T12:00:00.000Z"
    }
  ]
}
```

Regras importantes:

* O progresso só chega a **100%** quando todos os estágios obrigatórios estão completos. Para produtores isso inclui **criar/fazer upload de um produto ou se afiliar a uma oferta**; para rifeiros esse passo é opcional.
* O estágio de documentos só fica completo quando `missingDocuments` estiver vazio (selfie + frente + verso).
* O estágio de compliance exige `approvalStatus = APPROVED`, garantindo que o dashboard não mostre 100% enquanto a validação não for concluída.

## Painel Administrativo

| Endpoint | Método | Descrição |
| --- | --- | --- |
| `/admin/verifications` | GET | Lista perfis pendentes com documentos anexos |
| `/admin/verifications/:merchantId/approve` | POST | Aprova conta, registra notas e envia e-mail |
| `/admin/verifications/:merchantId/reject` | POST | Reprova conta obrigando justificativa |
| `/admin/documents` | GET | Lista documentos enviados com filtros (`status`, `type`, `search`, `page`, `pageSize`) |
| `/admin/documents/:documentId/status` | PATCH | Atualiza status do documento (`PENDING_REVIEW`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`) com notas/justificativa |
| `/admin/notifications` | GET | Retorna contadores agregados (pendentes, rejeitados, merchants aguardando) e os últimos 5 documentos pendentes |

* Rotas protegidas por `authMiddleware` + `requireRoles("ADMIN")`.
* Decisões atualizam `MerchantProfile.approvalStatus`, `approvalNotes` e os campos de auditoria dos documentos (`reviewedBy`, `reviewedAt`, `verificationNotes`).
* Notificações são disparadas via `EmailService.sendOnboardingStatusEmail` utilizando os templates Handlebars (`onboarding-approved.hbs` e `onboarding-rejected.hbs`).

## Requisitos Legais e Auditoria

* Todos os uploads exigem autenticação e passam por rate limiting (`express-rate-limit`).
* Os arquivos recebem nomes randômicos (`crypto.randomUUID`) e são servidos somente após autenticação.
* Cada decisão administrativa gera logs estruturados (`logger`) com `merchantId`, `reviewerId` e motivo.
* Métricas podem ser expostas via `/metrics` para monitorar quantidade de aprovações/reprovações (ex.: utilizando prom-client em próximos incrementos).

## Testes

* **Unitários**: `OnboardingService` e `AdminVerificationService` possuem testes em `src/application/services/__tests__`.
* **Integração**: rotas de onboarding são exercitadas em `src/infrastructure/http/routes/__tests__/onboardingRoutes.test.ts`.
* Execute `pnpm test --filter backend` para validar o módulo.

## Próximos Passos

* Integrar provedor KYC externo para validação automática.
* Persistir trilhas de auditoria em tabela dedicada (ex.: `VerificationHistory`).
* Adicionar métricas Prometheus específicas para tempo de aprovação e taxa de reprovação.

