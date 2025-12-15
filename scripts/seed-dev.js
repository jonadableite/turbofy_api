/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const email = "dev-merchant@turbofy.local";
  const document = "00000000000000";
  const name = "Dev Merchant";

  let merchant = await prisma.merchant.findFirst({ where: { email } });
  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        name,
        email,
        document,
        active: true,
      },
    });
    console.log("[SEED] Merchant criado:", merchant.id);
  } else {
    console.log("[SEED] Merchant existente:", merchant.id);
  }

  const config = await prisma.checkoutConfig.upsert({
    where: { merchantId: merchant.id },
    update: {},
    create: {
      merchantId: merchant.id,
      logoUrl: null,
      themeTokens: {
        primary: "oklch(0.65 0.2 250)",
        background: "oklch(0.12 0.03 255)",
        text: "oklch(0.95 0.02 255)",
        radius: 16,
      },
      animations: true,
    },
  });
  console.log("[SEED] CheckoutConfig pronta para merchant:", config.merchantId);

  // Criar usuário de desenvolvimento associado ao merchant
  const userEmail = "dev@turbofy.local";
  let user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: "dev-hash",
        roles: ["admin"],
        document: "00000000000",
        merchantId: merchant.id,
      },
      select: { id: true, merchantId: true, email: true },
    });
    console.log("[SEED] User dev criado:", user.id);
  } else if (!user.merchantId) {
    await prisma.user.update({ where: { id: user.id }, data: { merchantId: merchant.id } });
    console.log("[SEED] User dev associado ao merchant:", merchant.id);
  }

  console.log("NEXT_PUBLIC_DEV_MERCHANT_ID=", merchant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
