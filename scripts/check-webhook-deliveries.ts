/**
 * Script: Verificar Deliveries de Webhooks
 * 
 * Verifica se os webhooks estão sendo processados e entregues corretamente
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkWebhookDeliveries(): Promise<void> {
  console.log("🔍 Verificando deliveries de webhooks...\n");

  try {
    // 1. Buscar webhooks ativos do merchant
    const merchantId = process.env.MERCHANT_ID || "de9f810a-fefe-45b5-b269-b4123f4b3a61";
    
    const webhooks = await prisma.webhook.findMany({
      where: { merchantId },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    console.log(`📊 Webhooks cadastrados: ${webhooks.length}\n`);

    for (const webhook of webhooks) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📌 Webhook: ${webhook.name}`);
      console.log(`   ID: ${webhook.publicId}`);
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Status: ${webhook.status}`);
      console.log(`   Eventos: ${webhook.events.join(", ")}`);
      console.log(`   Falhas consecutivas: ${webhook.failureCount}`);
      console.log(`   Última chamada: ${webhook.lastCalledAt || "Nunca"}`);
      console.log(`   Último sucesso: ${webhook.lastSuccess || "Nunca"}`);
      console.log(`   Última falha: ${webhook.lastFailure || "Nunca"}`);
      if (webhook.lastError) {
        console.log(`   ⚠️  Último erro: ${webhook.lastError}`);
      }

      // Deliveries
      console.log(`\n   📦 Deliveries (últimas 10):`);
      if (webhook.deliveries.length === 0) {
        console.log(`      ⚠️  Nenhuma delivery encontrada`);
      } else {
        for (const delivery of webhook.deliveries) {
          const statusIcon = 
            delivery.status === "SUCCESS" ? "✅" :
            delivery.status === "FAILED" ? "❌" :
            delivery.status === "RETRYING" ? "🔄" :
            "⏳";
          
          console.log(`      ${statusIcon} ${delivery.id}`);
          console.log(`         Evento: ${delivery.eventType}`);
          console.log(`         Status: ${delivery.status}`);
          console.log(`         Tentativa: ${delivery.attempt}/${MAX_ATTEMPTS}`);
          console.log(`         HTTP Status: ${delivery.httpStatus || "N/A"}`);
          if (delivery.errorMessage) {
            console.log(`         Erro: ${delivery.errorMessage}`);
          }
          console.log(`         Criado em: ${delivery.createdAt.toISOString()}`);
          if (delivery.nextAttemptAt) {
            console.log(`         Próxima tentativa: ${delivery.nextAttemptAt.toISOString()}`);
          }
        }
      }

      // Logs
      console.log(`\n   📝 Logs (últimos 5):`);
      if (webhook.logs.length === 0) {
        console.log(`      ⚠️  Nenhum log encontrado`);
      } else {
        for (const log of webhook.logs) {
          const statusIcon = log.success ? "✅" : "❌";
          console.log(`      ${statusIcon} ${log.event} (tentativa ${log.attemptNumber})`);
          console.log(`         HTTP: ${log.responseCode || "N/A"} | Tempo: ${log.responseTime || "N/A"}ms`);
          if (log.errorMessage) {
            console.log(`         Erro: ${log.errorMessage}`);
          }
          console.log(`         ${log.createdAt.toISOString()}`);
        }
      }
    }

    // 2. Buscar cobranças recentes do merchant
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`💰 Cobranças recentes (últimas 5):\n`);

    const charges = await prisma.charge.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const charge of charges) {
      const statusIcon = 
        charge.status === "PAID" ? "✅" :
        charge.status === "PENDING" ? "⏳" :
        charge.status === "EXPIRED" ? "❌" :
        "❓";
      
      console.log(`${statusIcon} ${charge.id}`);
      console.log(`   Status: ${charge.status}`);
      console.log(`   Valor: R$ ${charge.amountCents / 100}`);
      console.log(`   Método: ${charge.method}`);
      console.log(`   Ref Externa: ${charge.externalRef || "N/A"}`);
      console.log(`   Criado em: ${charge.createdAt.toISOString()}`);
      if (charge.paidAt) {
        console.log(`   Pago em: ${charge.paidAt.toISOString()}`);
      }
      console.log("");
    }

    // 3. Verificar se há eventos pendentes no RabbitMQ (não é possível via Prisma)
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Resumo:\n`);
    console.log(`   Webhooks ativos: ${webhooks.filter(w => w.status === "ACTIVE").length}`);
    console.log(`   Webhooks com falhas: ${webhooks.filter(w => w.failureCount > 0).length}`);
    console.log(`   Total de deliveries: ${webhooks.reduce((sum, w) => sum + w.deliveries.length, 0)}`);
    console.log(`   Deliveries com sucesso: ${webhooks.reduce((sum, w) => sum + w.deliveries.filter(d => d.status === "SUCCESS").length, 0)}`);
    console.log(`   Deliveries falhadas: ${webhooks.reduce((sum, w) => sum + w.deliveries.filter(d => d.status === "FAILED").length, 0)}`);
    console.log(`   Deliveries pendentes: ${webhooks.reduce((sum, w) => sum + w.deliveries.filter(d => d.status === "PENDING" || d.status === "RETRYING").length, 0)}`);

    console.log(`\n✅ Verificação concluída!`);

  } catch (error) {
    console.error("❌ Erro ao verificar deliveries:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

const MAX_ATTEMPTS = 5;

checkWebhookDeliveries().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
