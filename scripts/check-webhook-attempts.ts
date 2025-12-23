/**
 * Script para verificar tentativas de webhook da Transfeera
 * 
 * Uso:
 *   pnpm tsx scripts/check-webhook-attempts.ts [chargeId]
 */

import { prisma } from "../src/infrastructure/database/prismaClient";

async function checkWebhookAttempts(chargeId?: string) {
  console.log("🔍 Verificando Tentativas de Webhook Transfeera\n");

  if (chargeId) {
    console.log(`Buscando tentativas para charge: ${chargeId}\n`);
    
    // Buscar charge
    const charge = await prisma.charge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        pixTxid: true,
        externalRef: true,
        merchantId: true,
        status: true,
        amountCents: true,
        createdAt: true,
      },
    });

    if (!charge) {
      console.log(`❌ Charge não encontrada: ${chargeId}`);
      await prisma.$disconnect();
      return;
    }

    console.log("📊 Dados da Charge:");
    console.log(`  ID: ${charge.id}`);
    console.log(`  Pix Txid: ${charge.pixTxid || "null"}`);
    console.log(`  External Ref: ${charge.externalRef || "null"}`);
    console.log(`  Merchant ID: ${charge.merchantId}`);
    console.log(`  Status: ${charge.status}`);
    console.log(`  Valor: R$ ${(charge.amountCents / 100).toFixed(2)}`);
    console.log(`  Criada em: ${charge.createdAt.toISOString()}\n`);

    // Buscar tentativas relacionadas
    const attempts = await prisma.webhookAttempt.findMany({
      where: {
        provider: "transfeera",
        OR: [
          { eventId: charge.id },
          { eventId: charge.pixTxid ?? "" },
          { eventId: charge.externalRef ?? "" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    console.log(`\n📨 Tentativas de Webhook: ${attempts.length}`);
    if (attempts.length === 0) {
      console.log("  ⚠️  Nenhuma tentativa encontrada - webhook pode não ter sido recebido");
    } else {
      attempts.forEach((attempt, idx) => {
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
  } else {
    // Buscar tentativas recentes
    console.log("Buscando tentativas recentes (últimas 24h)...\n");

    const recentAttempts = await prisma.webhookAttempt.findMany({
      where: {
        provider: "transfeera",
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    console.log(`📨 Tentativas Recentes: ${recentAttempts.length}\n`);

    if (recentAttempts.length === 0) {
      console.log("  ⚠️  Nenhuma tentativa encontrada nas últimas 24h");
      console.log("  Possíveis causas:");
      console.log("    - Webhook não está configurado na Transfeera");
      console.log("    - URL do webhook está incorreta");
      console.log("    - Transfeera não está enviando webhooks");
    } else {
      const byStatus = recentAttempts.reduce(
        (acc, attempt) => {
          acc[attempt.status] = (acc[attempt.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      console.log("Estatísticas:");
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });

      console.log("\nÚltimas 10 tentativas:");
      recentAttempts.slice(0, 10).forEach((attempt, idx) => {
        console.log(`\n  ${idx + 1}. ${attempt.type} - ${attempt.status}`);
        console.log(`     Event ID: ${attempt.eventId}`);
        console.log(`     Assinatura: ${attempt.signatureValid ? "✅" : "❌"}`);
        console.log(`     Tentativa: ${attempt.attempt}`);
        if (attempt.errorMessage) {
          console.log(`     Erro: ${attempt.errorMessage}`);
        }
        console.log(`     Criado: ${attempt.createdAt.toISOString()}`);
      });
    }
  }

  await prisma.$disconnect();
}

async function main() {
  const args = process.argv.slice(2);
  const chargeId = args[0];

  await checkWebhookAttempts(chargeId);
}

main().catch((error) => {
  console.error("Erro ao verificar tentativas:", error);
  process.exit(1);
});
