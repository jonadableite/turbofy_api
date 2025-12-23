/**
 * Script para verificar a configuração de webhooks na Transfeera
 * 
 * Este script:
 * 1. Lista webhooks configurados na Transfeera (API)
 * 2. Lista webhooks configurados no banco Turbofy
 * 3. Compara e identifica inconsistências
 * 4. Verifica eventos recentes na Transfeera
 * 
 * Uso: npx ts-node scripts/verify-transfeera-webhooks.ts
 */

import { config } from "dotenv";
config();

import { TransfeeraClient } from "../src/infrastructure/adapters/payment/TransfeeraClient";
import { prisma } from "../src/infrastructure/database/prismaClient";

const main = async (): Promise<void> => {
  console.log("═".repeat(60));
  console.log("🔍 Verificação de Webhooks Transfeera\n");

  try {
    // Verificar se há credenciais configuradas
    if (!process.env.TRANSFEERA_CLIENT_ID || !process.env.TRANSFEERA_CLIENT_SECRET) {
      console.error("❌ Credenciais TRANSFEERA_CLIENT_ID e TRANSFEERA_CLIENT_SECRET não configuradas");
      process.exit(1);
    }

    const client = new TransfeeraClient();

    // 1. Listar webhooks na Transfeera
    console.log("📡 1. Webhooks configurados na API Transfeera:");
    console.log("-".repeat(60));
    
    try {
      const transfeeraWebhooks = await client.listTransfeeraWebhooks();
      
      if (transfeeraWebhooks.length === 0) {
        console.log("   ⚠️  Nenhum webhook configurado na Transfeera");
        console.log("   💡 Você precisa criar um webhook na Transfeera para receber eventos");
      } else {
        for (const webhook of transfeeraWebhooks) {
          console.log(`\n   ID: ${webhook.id}`);
          console.log(`   URL: ${webhook.url}`);
          console.log(`   Tipos: ${webhook.object_types?.join(", ") || "Todos"}`);
          console.log(`   Schema: ${webhook.schema_version}`);
          console.log(`   Criado: ${webhook.created_at}`);
          console.log(`   Secret: ${webhook.signature_secret ? "✅ Configurado" : "❌ Ausente"}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      console.log(`   ❌ Erro ao listar webhooks na Transfeera: ${msg}`);
    }

    // 2. Listar webhooks no banco Turbofy
    console.log("\n\n📦 2. Webhooks configurados no banco Turbofy:");
    console.log("-".repeat(60));
    
    const localConfigs = await prisma.transfeeraWebhookConfig.findMany({
      orderBy: { createdAt: "desc" },
    });
    
    if (localConfigs.length === 0) {
      console.log("   ⚠️  Nenhum webhook configurado no banco Turbofy");
      console.log("   💡 Os webhooks devem ser criados via API /rifeiro/webhooks");
    } else {
      for (const config of localConfigs) {
        console.log(`\n   ID: ${config.id}`);
        console.log(`   Webhook ID: ${config.webhookId}`);
        console.log(`   Account ID: ${config.accountId}`);
        console.log(`   URL: ${config.url}`);
        console.log(`   Tipos: ${config.objectTypes?.join(", ") || "Todos"}`);
        console.log(`   Ativo: ${config.active ? "✅" : "❌"}`);
        console.log(`   Secret: ${config.signatureSecret ? "✅ Configurado" : "❌ Ausente"}`);
        console.log(`   Merchant: ${config.merchantId}`);
      }
    }

    // 3. Verificar eventos recentes na Transfeera
    console.log("\n\n📨 3. Eventos de webhook recentes (Transfeera API):");
    console.log("-".repeat(60));
    
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // A API da Transfeera requer as datas em formato específico
      const initialDate = yesterday.toISOString();
      const endDate = now.toISOString();
      
      // Buscar eventos (isso requer implementação no TransfeeraClient)
      console.log(`   Período: ${yesterday.toLocaleDateString()} - ${now.toLocaleDateString()}`);
      console.log("   ⚠️  Para ver eventos, use a API da Transfeera diretamente:");
      console.log(`   GET https://api.transfeera.com/webhook/event?initialDate=${encodeURIComponent(initialDate)}&endDate=${encodeURIComponent(endDate)}&page=1`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      console.log(`   ❌ Erro ao buscar eventos: ${msg}`);
    }

    // 4. Verificar tentativas de webhook no banco
    console.log("\n\n📊 4. Últimas tentativas de webhook (banco Turbofy):");
    console.log("-".repeat(60));
    
    const attempts = await prisma.webhookAttempt.findMany({
      where: { provider: "transfeera" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    if (attempts.length === 0) {
      console.log("   ⚠️  Nenhuma tentativa de webhook registrada");
      console.log("   💡 Isso pode indicar que nenhum webhook foi recebido ainda");
    } else {
      for (const attempt of attempts) {
        const statusIcon = attempt.status === "processed" ? "✅" : attempt.status === "rejected" ? "❌" : "⏳";
        console.log(`\n   ${statusIcon} ${attempt.eventId}`);
        console.log(`      Tipo: ${attempt.type}`);
        console.log(`      Status: ${attempt.status}`);
        console.log(`      Assinatura válida: ${attempt.signatureValid ? "✅" : "❌"}`);
        if (attempt.errorMessage) {
          console.log(`      Erro: ${attempt.errorMessage}`);
        }
        console.log(`      Data: ${attempt.createdAt?.toISOString()}`);
      }
    }

    // 5. Verificar charges pendentes (que aguardam pagamento)
    console.log("\n\n💰 5. Charges PIX pendentes (aguardando webhook):");
    console.log("-".repeat(60));
    
    const pendingCharges = await prisma.charge.findMany({
      where: {
        method: "PIX",
        status: "PENDING",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Últimos 7 dias
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    if (pendingCharges.length === 0) {
      console.log("   ✅ Nenhuma charge PIX pendente nos últimos 7 dias");
    } else {
      console.log(`   📋 ${pendingCharges.length} charge(s) PIX pendente(s):\n`);
      for (const charge of pendingCharges) {
        console.log(`   ID: ${charge.id}`);
        console.log(`   Valor: R$ ${(charge.amountCents / 100).toFixed(2)}`);
        console.log(`   External Ref: ${charge.externalRef || "N/A"}`);
        console.log(`   PIX TxId: ${charge.pixTxid || "N/A"}`);
        console.log(`   Merchant: ${charge.merchantId}`);
        console.log(`   Criado: ${charge.createdAt?.toISOString()}`);
        console.log("");
      }
    }

    // Resumo
    console.log("\n" + "═".repeat(60));
    console.log("📋 RESUMO:\n");
    
    const hasTransfeeraWebhooks = localConfigs.length > 0;
    const hasRecentAttempts = attempts.length > 0;
    const hasProcessedAttempts = attempts.some(a => a.status === "processed");
    
    if (!hasTransfeeraWebhooks) {
      console.log("❌ Webhooks não configurados no banco Turbofy");
      console.log("   → Crie um webhook via POST /rifeiro/webhooks");
    } else if (!hasRecentAttempts) {
      console.log("⚠️  Nenhuma tentativa de webhook recebida");
      console.log("   → Verifique se a URL está acessível externamente");
      console.log("   → Verifique se o webhook está configurado na Transfeera");
    } else if (!hasProcessedAttempts) {
      console.log("⚠️  Webhooks recebidos mas não processados");
      console.log("   → Verifique os logs de erro nas tentativas");
      console.log("   → Verifique se a assinatura está sendo validada corretamente");
    } else {
      console.log("✅ Webhooks configurados e processando corretamente");
    }

    console.log("\n💡 Dicas:");
    console.log("   • URL de webhook: https://api.turbofypay.com/webhooks/transfeera");
    console.log("   • Tipos recomendados: CashIn, Transfer, CashInRefund");
    console.log("   • Teste o endpoint: GET /webhooks/transfeera/health");
    console.log("   • Veja status: GET /webhooks/transfeera/status");
    
    console.log("\n" + "═".repeat(60));

  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch(console.error);
