/**
 * Script para Configurar Webhook da Transfeera Automaticamente
 * 
 * Este script:
 * 1. Verifica se já existe webhook configurado para o merchant
 * 2. Se não existir, cria na Transfeera apontando para o Turbofy
 * 3. Salva configuração no banco
 * 4. Testa o webhook
 * 
 * Uso: 
 *   npx ts-node scripts/setup-transfeera-webhook.ts [merchant-id]
 * 
 * Se merchant-id não for fornecido, usa o primeiro merchant RIFEIRO encontrado.
 */

import { config } from "dotenv";
config();

import { prisma } from "../src/infrastructure/database/prismaClient";
import { TransfeeraWebhookService } from "../src/application/services/TransfeeraWebhookService";
import { TransfeeraClient } from "../src/infrastructure/adapters/payment/TransfeeraClient";
import { PrismaTransfeeraWebhookConfigRepository } from "../src/infrastructure/database/repositories/PrismaTransfeeraWebhookConfigRepository";

const MERCHANT_ID = process.argv[2];
const TURBOFY_WEBHOOK_URL = process.env.TURBOFY_WEBHOOK_URL || "https://api.turbofypay.com/webhooks/transfeera";

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("🔧 Configuração Automática de Webhook Transfeera\n");
  console.log(`URL do Turbofy: ${TURBOFY_WEBHOOK_URL}\n`);

  try {
    // Buscar merchant
    let merchant;
    if (MERCHANT_ID) {
      merchant = await prisma.merchant.findUnique({
        where: { id: MERCHANT_ID },
      });
      if (!merchant) {
        console.error(`❌ Merchant não encontrado: ${MERCHANT_ID}`);
        process.exit(1);
      }
    } else {
      merchant = await prisma.merchant.findFirst({
        where: { type: "RIFEIRO" },
      });
      if (!merchant) {
        console.error("❌ Nenhum merchant RIFEIRO encontrado");
        console.log("💡 Forneça um merchant-id: npx ts-node scripts/setup-transfeera-webhook.ts <merchant-id>");
        process.exit(1);
      }
    }

    console.log(`✅ Merchant encontrado: ${merchant.id} (${merchant.type})\n`);

    // Verificar se já existe webhook configurado
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    const existingConfigs = await webhookConfigRepo.findByMerchant(merchant.id);

    if (existingConfigs.length > 0) {
      console.log("📋 Webhook já configurado:\n");
      existingConfigs.forEach((config) => {
        console.log(`   ID: ${config.webhookId}`);
        console.log(`   URL: ${config.url}`);
        console.log(`   Object Types: ${config.objectTypes.join(", ")}`);
        console.log(`   Active: ${config.active}`);
        console.log(`   Created: ${config.createdAt.toISOString()}\n`);
      });

      const shouldRecreate = process.argv.includes("--force");
      if (!shouldRecreate) {
        console.log("💡 Para recriar, use: npx ts-node scripts/setup-transfeera-webhook.ts --force");
        return;
      }

      console.log("🔄 Recriando webhook...\n");
    }

    // Criar webhook
    const transfeeraClient = new TransfeeraClient();
    const webhookService = new TransfeeraWebhookService(webhookConfigRepo, transfeeraClient);

    console.log("📤 Criando webhook na Transfeera...");
    const webhook = await webhookService.createWebhook(
      merchant.id,
      TURBOFY_WEBHOOK_URL,
      ["CashIn", "Transfer", "CashInRefund"]
    );

    console.log("✅ Webhook criado com sucesso!\n");
    console.log("📋 Detalhes:");
    console.log(`   Webhook ID: ${webhook.webhookId}`);
    console.log(`   Account ID: ${webhook.accountId}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Object Types: ${webhook.objectTypes.join(", ")}`);
    console.log(`   Schema Version: ${webhook.schemaVersion}`);
    console.log(`   Active: ${webhook.active}\n`);

    // Testar webhook
    console.log("🧪 Testando webhook...");
    try {
      const testResult = await webhookService.testWebhook(merchant.id, webhook.webhookId);
      if (testResult.success) {
        console.log(`✅ Teste bem-sucedido! (${testResult.statusCode} - ${testResult.durationMs}ms)\n`);
      } else {
        console.log(`⚠️  Teste falhou: ${testResult.error}\n`);
      }
    } catch (error) {
      console.log(`⚠️  Erro ao testar webhook: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    }

    // Verificar eventos na Transfeera (opcional)
    console.log("📊 Verificando eventos na Transfeera...");
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const events = await transfeeraClient.listTransfeeraWebhookEvents({
        initialDate: yesterday.toISOString(),
        endDate: now.toISOString(),
        page: "1",
        objectType: "CashIn",
      });

      console.log(`   Total de eventos CashIn (últimas 24h): ${events.metadata?.pagination?.totalItems || 0}`);
      if (events.data && events.data.length > 0) {
        console.log(`   Último evento: ${events.data[0].date}`);
        console.log(`   Entregue: ${events.data[0].delivered ? "✅" : "❌"}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Não foi possível verificar eventos: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    console.log("\n" + "═".repeat(60));
    console.log("✅ Configuração concluída!\n");
    console.log("📋 Próximos passos:");
    console.log("   1. Quando um PIX for pago, a Transfeera enviará webhook para:");
    console.log(`      ${TURBOFY_WEBHOOK_URL}`);
    console.log("   2. O Turbofy processará e atualizará a charge");
    console.log("   3. O Turbofy enviará webhook para o integrador (se configurado)");
    console.log("\n💡 Para verificar eventos:");
    console.log("   npx ts-node scripts/verify-transfeera-webhooks.ts");

  } catch (error) {
    console.error("❌ Erro:", error);
    if (error instanceof Error) {
      console.error("   Mensagem:", error.message);
      if (error.stack) {
        console.error("   Stack:", error.stack);
      }
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
