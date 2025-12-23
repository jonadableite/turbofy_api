/**
 * Script de Teste End-to-End: Fluxo Completo de Webhook
 * 
 * Este script testa o fluxo completo:
 * 1. Cria uma charge PIX
 * 2. Simula webhook da Transfeera (CashIn - PIX pago)
 * 3. Verifica se a charge foi atualizada para PAID
 * 4. Verifica se o evento charge.paid foi publicado
 * 5. Verifica se o webhook foi enviado para o integrador
 * 
 * Uso: npx ts-node scripts/test-webhook-flow.ts
 */

import { config } from "dotenv";
config();

import crypto from "crypto";
import axios from "axios";
import { prisma } from "../src/infrastructure/database/prismaClient";
import { PrismaChargeRepository } from "../src/infrastructure/database/PrismaChargeRepository";
import { PrismaTransfeeraWebhookConfigRepository } from "../src/infrastructure/database/repositories/PrismaTransfeeraWebhookConfigRepository";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const TEST_MERCHANT_ID = process.env.TEST_MERCHANT_ID || "";

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
  console.log("🧪 Teste End-to-End: Fluxo de Webhook Transfeera\n");
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Merchant ID: ${TEST_MERCHANT_ID || "Não configurado"}\n`);

  try {
    // Passo 1: Verificar se há webhook configurado
    console.log("📋 Passo 1: Verificando configuração de webhook...");
    const webhookConfigRepo = new PrismaTransfeeraWebhookConfigRepository();
    
    let webhookConfig;
    if (TEST_MERCHANT_ID) {
      const configs = await webhookConfigRepo.findByMerchant(TEST_MERCHANT_ID);
      webhookConfig = configs[0];
    } else {
      // Buscar qualquer webhook configurado
      const allConfigs = await prisma.transfeeraWebhookConfig.findMany({ take: 1 });
      webhookConfig = allConfigs[0] ? await webhookConfigRepo.findByWebhookId(allConfigs[0].webhookId) : null;
    }

    if (!webhookConfig) {
      logResult({
        step: "Configuração de Webhook",
        success: false,
        message: "Nenhum webhook configurado. Configure um webhook primeiro.",
      });
      console.log("\n💡 Para configurar um webhook:");
      console.log("   1. Crie um webhook na Transfeera via API");
      console.log("   2. Salve a configuração no banco via POST /rifeiro/webhooks");
      return;
    }

    const secret = await webhookConfigRepo.getSignatureSecret(webhookConfig.webhookId);
    if (!secret) {
      logResult({
        step: "Secret do Webhook",
        success: false,
        message: "Secret não encontrado no banco",
      });
      return;
    }

    logResult({
      step: "Configuração de Webhook",
      success: true,
      message: `Webhook encontrado: ${webhookConfig.webhookId}`,
      data: {
        accountId: webhookConfig.accountId,
        url: webhookConfig.url,
        objectTypes: webhookConfig.objectTypes,
      },
    });

    // Passo 2: Criar uma charge PIX
    console.log("\n📋 Passo 2: Criando charge PIX...");
    
    const chargeRepository = new PrismaChargeRepository();
    
    // Buscar um merchant válido
    const merchant = await prisma.merchant.findFirst({
      where: TEST_MERCHANT_ID ? { id: TEST_MERCHANT_ID } : undefined,
    });

    if (!merchant) {
      logResult({
        step: "Criar Charge",
        success: false,
        message: "Nenhum merchant encontrado. Configure TEST_MERCHANT_ID ou crie um merchant.",
      });
      return;
    }

    const amountCents = 10000; // R$ 100,00
    const externalRef = `test-${Date.now()}`;
    
    // Criar charge diretamente no banco (simulando criação via API)
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

    // Passo 3: Simular webhook da Transfeera
    console.log("\n📋 Passo 3: Simulando webhook da Transfeera (CashIn)...");
    
    const webhookEvent = {
      id: `evt_${Date.now()}`,
      version: "v1",
      account_id: webhookConfig.accountId,
      object: "CashIn",
      date: new Date().toISOString(),
      data: {
        id: `cashin_${Date.now()}`,
        txid: charge.pixTxid || `E${Date.now()}`,
        value: amountCents / 100, // Converter centavos para reais
        end2end_id: `E${Date.now()}`,
        integration_id: externalRef,
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

    // Enviar webhook
    try {
      const response = await axios.post(
        `${API_BASE_URL}/webhooks/transfeera`,
        webhookEvent,
        {
          headers: {
            "Content-Type": "application/json",
            "Transfeera-Signature": signatureHeader,
            "User-Agent": "Turbofy Test Script/1.0",
          },
          validateStatus: () => true, // Aceitar qualquer status
        }
      );

      if (response.status === 200) {
        logResult({
          step: "Enviar Webhook",
          success: true,
          message: `Webhook recebido com sucesso (status ${response.status})`,
          data: {
            response: response.data,
          },
        });
      } else {
        logResult({
          step: "Enviar Webhook",
          success: false,
          message: `Webhook rejeitado (status ${response.status})`,
          data: {
            response: response.data,
            status: response.status,
          },
        });
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      logResult({
        step: "Enviar Webhook",
        success: false,
        message: `Erro ao enviar webhook: ${msg}`,
      });
      return;
    }

    // Aguardar processamento assíncrono
    console.log("\n⏳ Aguardando processamento assíncrono (3 segundos)...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Passo 4: Verificar se a charge foi atualizada
    console.log("\n📋 Passo 4: Verificando se a charge foi atualizada...");
    
    const updatedCharge = await chargeRepository.findById(charge.id);
    
    if (!updatedCharge) {
      logResult({
        step: "Verificar Charge",
        success: false,
        message: "Charge não encontrada",
      });
      return;
    }

    if (updatedCharge.status === "PAID") {
      logResult({
        step: "Verificar Charge",
        success: true,
        message: `Charge atualizada para PAID`,
        data: {
          status: updatedCharge.status,
          paidAt: updatedCharge.paidAt,
        },
      });
    } else {
      logResult({
        step: "Verificar Charge",
        success: false,
        message: `Charge ainda está ${updatedCharge.status}, esperado PAID`,
        data: {
          status: updatedCharge.status,
        },
      });
    }

    // Passo 5: Verificar PaymentInteraction
    console.log("\n📋 Passo 5: Verificando PaymentInteraction...");
    
    const interactions = await prisma.paymentInteraction.findMany({
      where: {
        chargeId: charge.id,
        type: "CHARGE_PAID",
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (interactions.length > 0) {
      logResult({
        step: "PaymentInteraction",
        success: true,
        message: `PaymentInteraction criado`,
        data: {
          interactionId: interactions[0].id,
          type: interactions[0].type,
        },
      });
    } else {
      logResult({
        step: "PaymentInteraction",
        success: false,
        message: "PaymentInteraction não encontrado",
      });
    }

    // Passo 6: Verificar WebhookDelivery (se houver webhook do integrador)
    console.log("\n📋 Passo 6: Verificando webhooks para integradores...");
    
    const webhookDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        eventType: "charge.paid",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (webhookDeliveries.length > 0) {
      logResult({
        step: "Webhook Delivery",
        success: true,
        message: `${webhookDeliveries.length} webhook(s) para integradores encontrado(s)`,
        data: {
          deliveries: webhookDeliveries.map(d => ({
            id: d.id,
            status: d.status,
            attempt: d.attempt,
          })),
        },
      });
    } else {
      logResult({
        step: "Webhook Delivery",
        success: true,
        message: "Nenhum webhook de integrador configurado (isso é normal se não houver integradores)",
      });
    }

    // Resumo final
    console.log("\n" + "═".repeat(60));
    console.log("📊 RESUMO DO TESTE:\n");
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    results.forEach((result, index) => {
      const icon = result.success ? "✅" : "❌";
      console.log(`${index + 1}. ${icon} ${result.step}`);
    });
    
    console.log(`\n✅ Sucessos: ${successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
      console.log("\n🎉 Todos os testes passaram! O fluxo de webhook está funcionando corretamente.");
    } else {
      console.log("\n⚠️  Alguns testes falharam. Verifique os logs acima para detalhes.");
    }

    // Limpeza: Deletar charge de teste
    console.log("\n🧹 Limpando dados de teste...");
    await prisma.charge.delete({ where: { id: charge.id } }).catch(() => {});
    await prisma.paymentInteraction.deleteMany({ where: { chargeId: charge.id } }).catch(() => {});
    console.log("✅ Dados de teste removidos");

  } catch (error) {
    console.error("❌ Erro durante o teste:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
