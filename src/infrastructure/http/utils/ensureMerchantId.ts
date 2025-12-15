import { prisma } from "../../database/prismaClient";
import { logger } from "../../logger";

export const ensureMerchantId = async (userId: string): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, merchantId: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.merchantId) {
    return user.merchantId;
  }

  const name = (user.email || "Merchant").split("@")[0];
  const document = `AUTO-${user.id}`;

  const merchant = await prisma.merchant.create({
    data: {
      name,
      email: user.email,
      document,
      active: true,
    },
    select: { id: true },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { merchantId: merchant.id },
  });

  logger.info(
    { userId: user.id, merchantId: merchant.id },
    "Merchant created automatically"
  );

  return merchant.id;
};


