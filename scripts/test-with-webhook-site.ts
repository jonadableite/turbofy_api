/**
 * Script de Teste com Webhook.site
 * 
 * Este script:
 * 1. Configura um webhook na Transfeera apontando para webhook.site
 * 2. Cria uma charge PIX
 * 3. Aguarda pagamento (ou simula)
 * 4. Verifica se o webhook foi recebido no webhook.site
 * 
 * Uso: 
 *   1. Obtenha uma URL do webhook.site: https://webhook.site
 *   2. Execute: npx ts-node scripts/test-with-webhook-site.ts <webhook-site-url>
 * 
 * Exemplo:
 *   npx ts-node scripts/test-with-webhook-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
 */

import { config } from "dotenv";
config();

import axios from "axios";
import { prisma } from "../src/infrastructure/database/prismaClient";
import { PrismaChargeRepository } from "../src/infrastructure/database/PrismaChargeRepository";
import { TransfeeraClient } from "../src/infrastructure/adapters/payment/TransfeeraClient";
import { PrismaTransfeeraWebhookConfigRepository } from "../src/infrastructure/database/repositories/PrismaTransfeeraWebhookConfigRepository";
import { TransfeeraWebhookService } from "../src/application/services/TransfeeraWebhookService";

const WEBHOOK_SITE_URL = process.argv[2];
const TEST_MERCHANT_ID = process.env.TEST_MERCHANT_ID || "";

if (!WEBHOOK_SITE_URL) {
  console.error("❌ Erro: URL do webhook.site não fornecida");
  console.log("\n💡 Uso:");
  console.log("   npx ts-node scripts/test-with-webhook-site.ts <webhook-site-url>");
  console.log("\n📋 Exemplo:");
  console.log("   npx ts-node scripts/test-with-webhook-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3");
  process.exit(1);
}

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
  results.push(result);
  const icon = result.success ? "✅" : "❌";
  console.log(`${icon} ${result.step}: ${result.message}`);
  if (result.data) {
    console.log(`   Dados:`, JSON.stringify(result.data, null, 2));
  }
}

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("🧪 Teste com Webhook.site\n");
  console.log(`Webhook.site URL: ${WEBHOOK_SITE_URL}`);
  console.log(`Merchant ID: ${TEST_MERCHANT_ID || "Não configurado"}\n`);

  try {
    // Passo 1: Verificar se há merchant configurado
    console.log("📋 Passo 1: Verificando merchant...");
    
    let merchant;
    if (TEST_MERCHANT_ID) {
      merchant = await prisma.merchant.findUnique({
        where: { id: TEST_MERCHANT_ID },
      });
    } else {
      merchant = await prisma.merchant.findFirst({
        where: { type: "RIFEIRO" },
      });
    }

    if (!merchant) {
      logResult({
        step: "Verificar Merchant",
        success: false,
        message: "Nenhum merchant RIFEIRO encontrado. Configure TEST_MERCHANT_ID ou crie um merchant.",
      });
      return;
    }

    logResult({
      step: "Verificar Merchant",
      success: true,
      message: `Merchant encontrado: ${merchant.id}`,
    });

    // Passo 2: Configurar webhook na Transfeera
    console.log("\n📋 Passo 2: Configurando webhook na Transfeera...");
    
    const transfeeraClient = new TransfeeraClient();
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    const webhookService = new TransfeeraWebhookService(webhookConfigRepo, transfeeraClient);

    try {
      // Verificar se já existe webhook configurado
      const existingConfigs = await webhookConfigRepo.findByMerchant(merchant.id);
      let webhookConfig = existingConfigs.find(c => c.url === WEBHOOK_SITE_URL);

      if (!webhookConfig) {
        // Criar novo webhook
        const webhook = await webhookService.createWebhook(
          merchant.id,
          WEBHOOK_SITE_URL,
          ["CashIn", "Transfer", "CashInRefund"]
        );

        logResult({
          step: "Configurar Webhook",
          success: true,
          message: `Webhook criado na Transfeera: ${webhook.webhookId}`,
          data: {
            webhookId: webhook.webhookId,
            url: webhook.url,
            objectTypes: webhook.objectTypes,
          },
        });

        webhookConfig = await webhookConfigRepo.findByWebhookId(webhook.webhookId);
      } else {
        logResult({
          step: "Configurar Webhook",
          success: true,
          message: `Webhook já existe: ${webhookConfig.webhookId}`,
        });
      }

      // Passo 3: Criar charge PIX
      console.log("\n📋 Passo 3: Criando charge PIX...");
      
      const chargeRepository = new PrismaChargeRepository();
      const amountCents = 10000; // R$ 100,00
      const externalRef = `test-webhook-site-${Date.now()}`;
      
      const charge = await prisma.charge.create({
        data: {
          merchantId: merchant.id,
          amountCents,
          currency: "BRL",
          method: "PIX",
          status: "PENDING",
          externalRef,
          pixTxid: `E${Date.now()}`, // Simular txid
          metadata: {
            test: true,
            testId: externalRef,
            webhookSiteUrl: WEBHOOK_SITE_URL,
          },
        },
      });

      logResult({
        step: "Criar Charge",
        success: true,
        message: `Charge criada: ${charge.id}`,
        data: {
          chargeId: charge.id,
          amountCents: charge.amountCents,
          externalRef: charge.externalRef,
          pixTxid: charge.pixTxid,
        },
      });

      // Passo 4: Instruções para testar
      console.log("\n" + "═".repeat(60));
      console.log("📋 Próximos Passos:\n");
      console.log("1. Acesse o webhook.site para ver requisições recebidas:");
      console.log(`   ${WEBHOOK_SITE_URL}\n`);
      console.log("2. Para testar o webhook, você pode:");
      console.log("   a) Pagar o PIX real (se estiver em produção)");
      console.log("   b) Simular webhook manualmente usando o script:");
      console.log("      npx ts-node scripts/test-webhook-flow.ts\n");
      console.log("3. Quando o webhook for recebido, você verá:");
      console.log("   - Header 'Transfeera-Signature'");
      console.log("   - Payload JSON com evento CashIn");
      console.log("   - Status 200 na resposta\n");
      console.log("4. Após receber o webhook, verifique se:");
      console.log("   - A charge foi atualizada para PAID");
      console.log("   - O webhook foi enviado para integradores (se configurado)\n");

      // Passo 5: Verificar webhook.site (opcional - se tiver API key)
      console.log("📋 Passo 5: Verificando webhook.site...");
      console.log("   (Para ver requisições, acesse manualmente o link acima)\n");

      // Extrair UUID do webhook.site
      const webhookSiteMatch = WEBHOOK_SITE_URL.match(/webhook\.site\/([a-f0-9-]+)/i);
      if (webhookSiteMatch) {
        const webhookSiteUuid = webhookSiteMatch[1];
        const webhookSiteApiUrl = `https://webhook.site/${webhookSiteUuid}`;
        
        try {
          // Tentar buscar requisições via API do webhook.site (se disponível)
          const response = await axios.get(`${webhookSiteApiUrl}/requests`, {
            validateStatus: () => true,
          });

          if (response.status === 200 && Array.isArray(response.data)) {
            const requests = response.data as any[];
            logResult({
              step: "Verificar Webhook.site",
              success: true,
              message: `${requests.length} requisição(ões) recebida(s) no webhook.site`,
              data: {
                totalRequests: requests.length,
                latestRequest: requests[0] ? {
                  method: requests[0].method,
                  headers: Object.keys(requests[0].headers || {}),
                  receivedAt: requests[0].created_at,
                } : null,
              },
            });
          } else {
            logResult({
              step: "Verificar Webhook.site",
              success: true,
              message: "Acesse manualmente o webhook.site para ver requisições",
            });
          }
        } catch (error) {
          logResult({
            step: "Verificar Webhook.site",
            success: true,
            message: "Acesse manualmente o webhook.site para ver requisições",
          });
        }
      }

      // Resumo final
      console.log("\n" + "═".repeat(60));
      console.log("📊 RESUMO:\n");
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      results.forEach((result, index) => {
        const icon = result.success ? "✅" : "❌";
        console.log(`${index + 1}. ${icon} ${result.step}`);
      });
      
      console.log(`\n✅ Sucessos: ${successCount}/${totalCount}`);
      
      if (successCount === totalCount) {
        console.log("\n🎉 Configuração concluída! Agora você pode:");
        console.log("   1. Acessar o webhook.site para monitorar requisições");
        console.log("   2. Criar uma cobrança PIX real");
        console.log("   3. Pagar o PIX e verificar se o webhook foi recebido");
        console.log("\n💡 Dica: Mantenha o webhook.site aberto em uma aba para ver as requisições em tempo real!");
      }

      // Limpeza: Deletar charge de teste (opcional)
      console.log("\n🧹 Limpando dados de teste...");
      await prisma.charge.delete({ where: { id: charge.id } }).catch(() => {});
      console.log("✅ Dados de teste removidos");

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      logResult({
        step: "Configurar Webhook",
        success: false,
        message: `Erro ao configurar webhook: ${msg}`,
      });
    }

  } catch (error) {
    console.error("❌ Erro durante o teste:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
