import { PaymentInteraction as PrismaPaymentInteraction, Prisma } from "@prisma/client";
import { PaymentInteraction, PaymentInteractionType } from "../../../domain/entities/PaymentInteraction";
import { ChargeMethod } from "../../../domain/entities/Charge";
import { PaymentInteractionRepository } from "../../../ports/repositories/PaymentInteractionRepository";
import { prisma } from "../prismaClient";

type PaymentInteractionDelegate = NonNullable<typeof prisma.paymentInteraction>;

const getPaymentInteractionClient = (): PaymentInteractionDelegate => {
  const client = (prisma as typeof prisma & { paymentInteraction?: PaymentInteractionDelegate }).paymentInteraction;
  if (!client) {
    throw new Error(
      "PaymentInteraction delegate is missing from Prisma Client. Run `pnpm --filter backend prisma generate` to regenerate the client after schema changes."
    );
  }

  return client;
};

const mapToDomain = (model: PrismaPaymentInteraction): PaymentInteraction => {
  return new PaymentInteraction({
    id: model.id,
    merchantId: model.merchantId,
    userId: model.userId ?? undefined,
    chargeId: model.chargeId ?? undefined,
    sessionId: model.sessionId ?? undefined,
    type: model.type as PaymentInteractionType,
    method: model.method ? (model.method as ChargeMethod) : undefined,
    provider: model.provider ?? undefined,
    amountCents: model.amountCents ?? undefined,
    metadata: model.metadata
      ? (model.metadata as Record<string, unknown>)
      : undefined,
    createdAt: model.createdAt,
  });
};

export class PrismaPaymentInteractionRepository implements PaymentInteractionRepository {
  async create(interaction: PaymentInteraction): Promise<PaymentInteraction> {
    const created = await getPaymentInteractionClient().create({
      data: {
        id: interaction.id,
        merchantId: interaction.merchantId,
        userId: interaction.userId ?? null,
        chargeId: interaction.chargeId ?? null,
        sessionId: interaction.sessionId ?? null,
        type: interaction.type,
        method: interaction.method ?? null,
        provider: interaction.provider ?? null,
        amountCents: interaction.amountCents ?? null,
        metadata: interaction.metadata
          ? (interaction.metadata as Prisma.InputJsonValue)
          : undefined,
        createdAt: interaction.createdAt,
      },
    });

    return mapToDomain(created);
  }

  async listRecentByMerchant(params: { merchantId: string; limit: number }): Promise<PaymentInteraction[]> {
    const records = await getPaymentInteractionClient().findMany({
      where: { merchantId: params.merchantId },
      orderBy: { createdAt: "desc" },
      take: params.limit,
    });

    return records.map(mapToDomain);
  }
}

