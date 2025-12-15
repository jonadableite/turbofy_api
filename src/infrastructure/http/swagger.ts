import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import type { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Turbofy API',
      version: '1.0.0',
      description: 'Documentação dos endpoints de autenticação e MFA',
    },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      schemas: {
        CreateChargeRequest: {
          type: 'object',
          properties: {
            merchantId: { type: 'string', format: 'uuid' },
            amountCents: { type: 'integer', minimum: 1 },
            currency: { type: 'string', enum: ['BRL'], default: 'BRL' },
            description: { type: 'string', maxLength: 255 },
            method: { type: 'string', enum: ['PIX', 'BOLETO'] },
            expiresAt: { type: 'string', format: 'date-time' },
            idempotencyKey: { type: 'string', minLength: 8 },
            externalRef: { type: 'string', maxLength: 128 },
            metadata: { type: 'object', additionalProperties: true },
          },
          required: ['merchantId', 'amountCents', 'idempotencyKey'],
        },
        PixPayload: {
          type: 'object',
          properties: {
            qrCode: { type: 'string' },
            copyPaste: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
          required: ['qrCode', 'copyPaste', 'expiresAt'],
        },
        BoletoPayload: {
          type: 'object',
          properties: {
            boletoUrl: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
          required: ['boletoUrl', 'expiresAt'],
        },
        CreateChargeResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            merchantId: { type: 'string', format: 'uuid' },
            amountCents: { type: 'integer' },
            currency: { type: 'string', enum: ['BRL'] },
            description: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'CANCELED'] },
            method: { type: 'string', enum: ['PIX', 'BOLETO'], nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            idempotencyKey: { type: 'string' },
            externalRef: { type: 'string', nullable: true },
            metadata: { type: 'object', nullable: true },
            pix: { $ref: '#/components/schemas/PixPayload' },
            boleto: { $ref: '#/components/schemas/BoletoPayload' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'merchantId', 'amountCents', 'currency', 'status', 'idempotencyKey', 'createdAt', 'updatedAt'],
        },
        MfaRequest: {
          type: 'object',
          properties: { email: { type: 'string', format: 'email' } },
          required: ['email'],
        },
        MfaVerify: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            otp: { type: 'string', example: '123456' },
          },
          required: ['email', 'otp'],
        },
        Tokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        CreateReconciliationRequest: {
          type: 'object',
          properties: {
            merchantId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            type: { type: 'string', enum: ['AUTOMATIC', 'MANUAL'] },
            metadata: { type: 'object', additionalProperties: true },
          },
          required: ['merchantId', 'startDate', 'endDate', 'type'],
        },
        CreateReconciliationResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            merchantId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['AUTOMATIC', 'MANUAL'] },
            status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            matchesCount: { type: 'integer' },
            unmatchedChargesCount: { type: 'integer' },
            unmatchedTransactionsCount: { type: 'integer' },
            totalAmountCents: { type: 'integer' },
            matchedAmountCents: { type: 'integer' },
            matchRate: { type: 'number' },
            processedAt: { type: 'string', format: 'date-time', nullable: true },
            failureReason: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id','merchantId','type','status','startDate','endDate','createdAt','updatedAt'],
        },
        CreateSettlementRequest: {
          type: 'object',
          properties: {
            merchantId: { type: 'string', format: 'uuid' },
            amountCents: { type: 'integer', minimum: 1 },
            currency: { type: 'string', enum: ['BRL'], default: 'BRL' },
            bankAccountId: { type: 'string' },
            scheduledFor: { type: 'string', format: 'date-time' },
            metadata: { type: 'object', additionalProperties: true },
          },
          required: ['merchantId','amountCents','currency','bankAccountId'],
        },
        CreateSettlementResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            merchantId: { type: 'string', format: 'uuid' },
            amountCents: { type: 'integer' },
            currency: { type: 'string', enum: ['BRL'] },
            status: { type: 'string', enum: ['PENDING','SCHEDULED','PROCESSING','COMPLETED','FAILED','CANCELED'] },
            scheduledFor: { type: 'string', format: 'date-time', nullable: true },
            bankAccountId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id','merchantId','amountCents','currency','status','createdAt','updatedAt'],
        },
        ProcessSettlementResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            merchantId: { type: 'string', format: 'uuid' },
            amountCents: { type: 'integer' },
            currency: { type: 'string', enum: ['BRL'] },
            status: { type: 'string', enum: ['PENDING','SCHEDULED','PROCESSING','COMPLETED','FAILED','CANCELED'] },
            transactionId: { type: 'string', nullable: true },
            processedAt: { type: 'string', format: 'date-time', nullable: true },
            failureReason: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id','merchantId','amountCents','currency','status','updatedAt'],
        },
        TransfeeraWebhookEvent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            version: { type: 'string' },
            account_id: { type: 'string' },
            object: { type: 'string', enum: ['CashIn','CashInRefund','PixKey','ChargeReceivable','Payin','PaymentLink'] },
            date: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
          },
          required: ['id','object','data'],
        },
      },
    },
    paths: {
      '/charges': {
        post: {
          summary: 'Criar cobrança (Pix/Boleto)',
          parameters: [
            {
              in: 'header',
              name: 'X-Idempotency-Key',
              required: true,
              schema: { type: 'string' },
              description: 'Chave de idempotência única por requisição',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateChargeRequest' },
                examples: {
                  pix: {
                    value: {
                      merchantId: '8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55',
                      amountCents: 5000,
                      method: 'PIX',
                      idempotencyKey: 'idem-123',
                      description: 'Pedido #123',
                    },
                  },
                  boleto: {
                    value: {
                      merchantId: '8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55',
                      amountCents: 5000,
                      method: 'BOLETO',
                      idempotencyKey: 'idem-456',
                      description: 'Pedido #456',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Cobrança criada',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateChargeResponse' },
                },
              },
            },
            '400': { description: 'Erro de validação' },
            '500': { description: 'Erro interno' },
          },
        },
      },
      '/auth/mfa/request': {
        post: {
          summary: 'Solicitar OTP por e-mail',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MfaRequest' },
                examples: {
                  default: { value: { email: 'user@example.com' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Solicitação processada' },
            '400': { description: 'Entrada inválida' },
            '429': { description: 'Bloqueado por excesso de tentativas' },
          },
        },
      },
      '/auth/mfa/verify': {
        post: {
          summary: 'Verificar OTP e obter tokens',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MfaVerify' },
                examples: {
                  default: { value: { email: 'user@example.com', otp: '123456' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tokens emitidos',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Tokens' } },
              },
            },
            '400': { description: 'Entrada inválida' },
            '401': { description: 'OTP inválido/expirado' },
            '429': { description: 'Bloqueado por excesso de tentativas' },
          },
        },
      },
      '/reconciliations': {
        post: {
          summary: 'Executar conciliação (AUTOMATIC ou MANUAL)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateReconciliationRequest' },
                examples: {
                  automatic: {
                    value: {
                      merchantId: '8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55',
                      startDate: '2024-01-01T00:00:00.000Z',
                      endDate: '2024-01-31T23:59:59.999Z',
                      type: 'AUTOMATIC',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Conciliação criada e processada',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateReconciliationResponse' },
                },
              },
            },
            '400': { description: 'Erro de validação' },
            '500': { description: 'Erro interno' },
          },
        },
      },
      '/settlements': {
        post: {
          summary: 'Criar repasse (settlement)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateSettlementRequest' },
                examples: {
                  default: {
                    value: {
                      merchantId: '8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55',
                      amountCents: 10000,
                      currency: 'BRL',
                      bankAccountId: 'acc-123',
                      scheduledFor: '2024-02-01T12:00:00.000Z',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Repasse criado',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateSettlementResponse' },
                },
              },
            },
            '400': { description: 'Erro de validação' },
            '500': { description: 'Erro interno' },
          },
        },
      },
      '/settlements/{id}/process': {
        post: {
          summary: 'Processar repasse',
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Repasse processado',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ProcessSettlementResponse' },
                },
              },
            },
            '400': { description: 'Erro de validação' },
            '500': { description: 'Erro interno' },
          },
        },
      },
      '/webhooks/transfeera': {
        post: {
          summary: 'Webhook Transfeera',
          parameters: [
            {
              in: 'header',
              name: 'X-Transfeera-Signature',
              required: true,
              schema: { type: 'string' },
              description: 'Assinatura HMAC-SHA256 do corpo (hex ou sha256=<hex>)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TransfeeraWebhookEvent' } },
            },
          },
          responses: {
            '200': { description: 'Evento recebido' },
            '401': { description: 'Assinatura inválida' },
          },
        },
      },
    },
  },
  apis: [],
};

export function setupSwagger(app: Express) {
  const specs = swaggerJsdoc(options);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));
}
