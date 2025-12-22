/**
 * Script de Diagnóstico: Problema de Webhook Transfeera
 * 
 * Este script investiga por que webhooks de pagamento não estão sendo processados.
 * 
 * Uso:
 *   pnpm tsx scripts/diagnose-webhook-issue.ts [chargeId] [txid] [integrationId]
 */

import { PrismaChargeRepository } from "../src/infrastructure/database/PrismaChargeRepository";
import { prisma } from "../src/infrastructure/database/prismaClient";
import { PrismaWebhookAttemptRepository } from "../src/infrastructure/database/PrismaWebhookAttemptRepository";

interface DiagnosisResult {
  charge: {
    found: boolean;
    id?: string;
    merchantId?: string;
    externalRef?: string | null;
    pixTxid?: string | null;
    status?: string;
    paidAt?: Date | null;
  };
  webhookAttempts: Array<{
    id: string;
    provider: string;
    type: string;
    eventId: string;
    status: string;
    attempt: number;
    signatureValid: boolean;
    errorMessage?: string | null;
    createdAt: Date;
  }>;
  matchingIssues: string[];
  recommendations: string[];
}

async function diagnoseWebhookIssue(
  chargeId?: string,
  txid?: string,
  integrationId?: string
): Promise<DiagnosisResult> {
  const result: DiagnosisResult = {
    charge: { found: false },
    webhookAttempts: [],
    matchingIssues: [],
    recommendations: [],
  };

  const chargeRepository = new PrismaChargeRepository();
  const attemptRepo = new PrismaWebhookAttemptRepository();

  // 1. Tentar encontrar a charge
  let charge = null;

  if (chargeId) {
    charge = await chargeRepository.findById(chargeId);
    if (charge) {
      result.charge = {
        found: true,
        id: charge.id,
        merchantId: charge.merchantId,
        externalRef: charge.externalRef,
        pixTxid: charge.pixTxid,
        status: charge.status,
        paidAt: charge.paidAt,
      };
    }
  }

  if (!charge && txid) {
    charge = await chargeRepository.findByTxid(txid);
    if (charge) {
      result.charge = {
        found: true,
        id: charge.id,
        merchantId: charge.merchantId,
        externalRef: charge.externalRef,
        pixTxid: charge.pixTxid,
        status: charge.status,
        paidAt: charge.paidAt,
      };
    } else {
      result.matchingIssues.push(
        `Charge não encontrada por txid: ${txid}`
      );
    }
  }

  if (!charge && integrationId) {
    charge = await chargeRepository.findByExternalRef(integrationId);
    if (charge) {
      result.charge = {
        found: true,
        id: charge.id,
        merchantId: charge.merchantId,
        externalRef: charge.externalRef,
        pixTxid: charge.pixTxid,
        status: charge.status,
        paidAt: charge.paidAt,
      };
    } else {
      result.matchingIssues.push(
        `Charge não encontrada por externalRef (integration_id): ${integrationId}`
      );
    }
  }

  // 2. Buscar tentativas de webhook
  if (charge) {
    const attempts = await prisma.webhookAttempt.findMany({
      where: {
        OR: [
          { eventId: charge.id },
          { eventId: charge.pixTxid ?? "" },
          { eventId: charge.externalRef ?? "" },
        ],
        provider: "transfeera",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    result.webhookAttempts = attempts.map((a) => ({
      id: a.id,
      provider: a.provider,
      type: a.type,
      eventId: a.eventId,
      status: a.status,
      attempt: a.attempt,
      signatureValid: a.signatureValid,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
    }));
  } else {
    // Buscar tentativas recentes mesmo sem charge
    const recentAttempts = await prisma.webhookAttempt.findMany({
      where: {
        provider: "transfeera",
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    result.webhookAttempts = recentAttempts.map((a) => ({
      id: a.id,
      provider: a.provider,
      type: a.type,
      eventId: a.eventId,
      status: a.status,
      attempt: a.attempt,
      signatureValid: a.signatureValid,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
    }));
  }

  // 3. Analisar problemas de matching
  if (charge && integrationId) {
    if (charge.externalRef !== integrationId) {
      result.matchingIssues.push(
        `Mismatch: externalRef da charge (${charge.externalRef}) != integration_id do webhook (${integrationId})`
      );
    }
  }

  if (charge && txid) {
    if (charge.pixTxid !== txid) {
      result.matchingIssues.push(
        `Mismatch: pixTxid da charge (${charge.pixTxid}) != txid do webhook (${txid})`
      );
    }
  }

  // 4. Verificar se charge está paga mas não foi processada
  if (charge && charge.status === "PAID" && !charge.paidAt) {
    result.matchingIssues.push(
      "Charge marcada como PAID mas paidAt está null - possível problema no processamento"
    );
  }

  // 5. Gerar recomendações
  if (!charge) {
    result.recommendations.push(
      "Charge não encontrada. Verifique se o integration_id ou txid estão corretos."
    );
    result.recommendations.push(
      "Verifique se a charge foi criada corretamente via POST /rifeiro/pix"
    );
  } else {
    if (result.matchingIssues.length > 0) {
      result.recommendations.push(
        "Problema de matching identificado. Verifique a lógica de busca no handleCashInEvent"
      );
    }

    if (charge.status !== "PAID") {
      result.recommendations.push(
        `Charge está com status ${charge.status}, não PAID. Verifique se o webhook foi processado.`
      );
    }

    const failedAttempts = result.webhookAttempts.filter(
      (a) => a.status === "failed" || a.status === "rejected"
    );
    if (failedAttempts.length > 0) {
      result.recommendations.push(
        `${failedAttempts.length} tentativas de webhook falharam. Verifique os erros acima.`
      );
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const chargeId = args[0];
  const txid = args[1];
  const integrationId = args[2];

  console.log("🔍 Diagnóstico de Webhook Transfeera\n");
  console.log("Parâmetros:");
  console.log(`  chargeId: ${chargeId || "não fornecido"}`);
  console.log(`  txid: ${txid || "não fornecido"}`);
  console.log(`  integrationId: ${integrationId || "não fornecido"}\n`);

  const result = await diagnoseWebhookIssue(chargeId, txid, integrationId);

  console.log("📊 Resultado do Diagnóstico:\n");

  console.log("Charge:");
  if (result.charge.found) {
    console.log(`  ✅ Encontrada: ${result.charge.id}`);
    console.log(`  Merchant ID: ${result.charge.merchantId}`);
    console.log(`  External Ref: ${result.charge.externalRef || "null"}`);
    console.log(`  Pix Txid: ${result.charge.pixTxid || "null"}`);
    console.log(`  Status: ${result.charge.status}`);
    console.log(`  Paid At: ${result.charge.paidAt?.toISOString() || "null"}`);
  } else {
    console.log("  ❌ Não encontrada");
  }

  console.log(`\nTentativas de Webhook: ${result.webhookAttempts.length}`);
  if (result.webhookAttempts.length > 0) {
    result.webhookAttempts.forEach((attempt, idx) => {
      console.log(`\n  Tentativa ${idx + 1}:`);
      console.log(`    ID: ${attempt.id}`);
      console.log(`    Tipo: ${attempt.type}`);
      console.log(`    Event ID: ${attempt.eventId}`);
      console.log(`    Status: ${attempt.status}`);
      console.log(`    Tentativa: ${attempt.attempt}`);
      console.log(`    Assinatura Válida: ${attempt.signatureValid}`);
      if (attempt.errorMessage) {
        console.log(`    Erro: ${attempt.errorMessage}`);
      }
      console.log(`    Criado em: ${attempt.createdAt.toISOString()}`);
    });
  }

  if (result.matchingIssues.length > 0) {
    console.log("\n⚠️  Problemas de Matching:");
    result.matchingIssues.forEach((issue) => {
      console.log(`  - ${issue}`);
    });
  }

  if (result.recommendations.length > 0) {
    console.log("\n💡 Recomendações:");
    result.recommendations.forEach((rec) => {
      console.log(`  - ${rec}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Erro ao executar diagnóstico:", error);
  process.exit(1);
});
