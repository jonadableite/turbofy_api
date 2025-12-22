/**
 * Script para Simular Webhook da Transfeera para Webhook.site
 * 
 * Este script simula um webhook da Transfeera enviando diretamente para o webhook.site.
 * Útil para testar a validação de assinatura e formato do payload.
 * 
 * Uso: 
 *   npx ts-node scripts/simulate-webhook-to-site.ts <webhook-site-url> [charge-id]
 * 
 * Exemplo:
 *   npx ts-node scripts/simulate-webhook-to-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3
 */

import { config } from "dotenv";
config();

import crypto from "crypto";
import axios from "axios";
import { prisma } from "../src/infrastructure/database/prismaClient";
import { PrismaChargeRepository } from "../src/infrastructure/database/PrismaChargeRepository";
import { PrismaTransfeeraWebhookConfigRepository } from "../src/infrastructure/database/repositories/PrismaTransfeeraWebhookConfigRepository";

const WEBHOOK_SITE_URL = process.argv[2];
const CHARGE_ID = process.argv[3];

if (!WEBHOOK_SITE_URL) {
  console.error("❌ Erro: URL do webhook.site não fornecida");
  console.log("\n💡 Uso:");
  console.log("   npx ts-node scripts/simulate-webhook-to-site.ts <webhook-site-url> [charge-id]");
  console.log("\n📋 Exemplo:");
  console.log("   npx ts-node scripts/simulate-webhook-to-site.ts https://webhook.site/36dda071-6d29-4488-9f77-b3e83f3a25e3");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("🧪 Simular Webhook Transfeera → Webhook.site\n");
  console.log(`Webhook.site URL: ${WEBHOOK_SITE_URL}\n`);

  try {
    // Buscar charge (se fornecido) ou criar uma de teste
    let charge;
    const chargeRepository = new PrismaChargeRepository();

    if (CHARGE_ID) {
      charge = await chargeRepository.findById(CHARGE_ID);
      if (!charge) {
        console.error(`❌ Charge não encontrada: ${CHARGE_ID}`);
        process.exit(1);
      }
    } else {
      // Buscar uma charge PIX pendente recente
      const recentCharge = await prisma.charge.findFirst({
        where: {
          method: "PIX",
          status: "PENDING",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentCharge) {
        charge = await chargeRepository.findById(recentCharge.id);
        console.log(`📋 Usando charge existente: ${charge.id}`);
      } else {
        // Criar charge de teste
        const merchant = await prisma.merchant.findFirst({
          where: { type: "RIFEIRO" },
        });

        if (!merchant) {
          console.error("❌ Nenhum merchant RIFEIRO encontrado");
          process.exit(1);
        }

        const testCharge = await prisma.charge.create({
          data: {
            merchantId: merchant.id,
            amountCents: 10000,
            currency: "BRL",
            method: "PIX",
            status: "PENDING",
            externalRef: `test-webhook-site-${Date.now()}`,
            pixTxid: `E${Date.now()}`,
            metadata: { test: true },
          },
        });

        charge = await chargeRepository.findById(testCharge.id);
        console.log(`📋 Charge de teste criada: ${charge.id}`);
      }
    }

    // Buscar configuração de webhook
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    const webhookConfigs = await webhookConfigRepo.findByMerchant(charge.merchantId);
    
    if (webhookConfigs.length === 0) {
      console.error("❌ Nenhum webhook configurado para este merchant");
      console.log("💡 Execute primeiro: npx ts-node scripts/test-with-webhook-site.ts <url>");
      process.exit(1);
    }

    const webhookConfig = webhookConfigs[0];
    const secret = await webhookConfigRepo.getSignatureSecret(webhookConfig.webhookId);

    if (!secret) {
      console.error("❌ Secret do webhook não encontrado");
      process.exit(1);
    }

    // Criar payload do webhook
    const webhookEvent = {
      id: `evt_${Date.now()}`,
      version: "v1",
      account_id: webhookConfig.accountId,
      object: "CashIn",
      date: new Date().toISOString(),
      data: {
        id: `cashin_${Date.now()}`,
        txid: charge.pixTxid || `E${Date.now()}`,
        value: charge.amountCents / 100, // Converter centavos para reais
        end2end_id: `E${Date.now()}`,
        integration_id: charge.externalRef || charge.id,
        pix_key: "test-pix-key",
        payer: {
          name: "Teste Usuário",
          document: "123.456.789-00",
          account_type: "CONTA_CORRENTE",
          account: "12345",
          account_digit: "6",
          agency: "0001",
          bank: {
            name: "Banco Teste",
            code: "001",
            ispb: "00000000",
          },
        },
      },
    };

    // Gerar assinatura HMAC
    const rawPayload = JSON.stringify(webhookEvent);
    const timestamp = Date.now().toString();
    const signedPayload = `${timestamp}.${rawPayload}`;
    const signature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;

    console.log("\n📤 Enviando webhook para webhook.site...");
    console.log(`   Charge ID: ${charge.id}`);
    console.log(`   Amount: R$ ${(charge.amountCents / 100).toFixed(2)}`);
    console.log(`   TXID: ${webhookEvent.data.txid}`);
    console.log(`   Signature: ${signatureHeader.substring(0, 50)}...\n`);

    // Enviar para webhook.site
    try {
      const response = await axios.post(
        WEBHOOK_SITE_URL,
        webhookEvent,
        {
          headers: {
            "Content-Type": "application/json",
            "Transfeera-Signature": signatureHeader,
            "User-Agent": "Turbofy Test Script/1.0",
          },
          validateStatus: () => true,
        }
      );

      if (response.status >= 200 && response.status < 300) {
        console.log("✅ Webhook enviado com sucesso!");
        console.log(`   Status: ${response.status}`);
        console.log(`\n📋 Verifique no webhook.site:`);
        console.log(`   ${WEBHOOK_SITE_URL}\n`);
        console.log("💡 Você deve ver:");
        console.log("   - Header 'Transfeera-Signature'");
        console.log("   - Payload JSON com evento CashIn");
        console.log("   - Status 200 na resposta");
      } else {
        console.log(`⚠️  Webhook enviado mas status inesperado: ${response.status}`);
        console.log(`   Resposta: ${JSON.stringify(response.data, null, 2)}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      console.error(`❌ Erro ao enviar webhook: ${msg}`);
      if (error instanceof Error && (error as any).response) {
        console.error(`   Status: ${(error as any).response.status}`);
        console.error(`   Data: ${JSON.stringify((error as any).response.data, null, 2)}`);
      }
    }

    // Limpeza: Deletar charge de teste (se foi criada)
    if (charge.metadata && (charge.metadata as any).test) {
      console.log("\n🧹 Removendo charge de teste...");
      await prisma.charge.delete({ where: { id: charge.id } }).catch(() => {});
      console.log("✅ Charge de teste removida");
    }

  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
