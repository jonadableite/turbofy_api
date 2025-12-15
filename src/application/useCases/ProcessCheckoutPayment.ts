/**
 * ProcessCheckoutPayment Use Case
 *
 * Processa o pagamento de um checkout personalizado.
 * Integra com Transfeera para Pix, Boleto ou Cartão.
 *
 * Fluxo:
 * 1. Valida checkout e dados do comprador
 * 2. Calcula valor total (produto + order bumps)
 * 3. Aplica cupom de desconto (se houver)
 * 4. Cria Charge no banco
 * 5. Cria cobrança na Transfeera
 * 6. Retorna dados de pagamento (QR Code, Boleto, etc)
 */

import { randomUUID } from "crypto";
import { Charge, ChargeMethod } from "../../domain/entities/Charge";
import { PaymentProviderFactory } from "../../infrastructure/adapters/payment/PaymentProviderFactory";
import { PrismaChargeRepository } from "../../infrastructure/database/PrismaChargeRepository";
import { PrismaCouponRepository } from "../../infrastructure/database/repositories/PrismaCouponRepository";
import { PrismaCoursePriceRepository } from "../../infrastructure/database/repositories/PrismaCoursePriceRepository";
import { PrismaProductCheckoutRepository } from "../../infrastructure/database/repositories/PrismaProductCheckoutRepository";
import { logger } from "../../infrastructure/logger";
import { PaymentProviderPort } from "../../ports/PaymentProviderPort";

export interface ProcessCheckoutPaymentInput {
  checkoutId: string;
  buyer: {
    name: string;
    email: string;
    document: string; // CPF ou CNPJ
    phone?: string;
  };
  paymentMethod: "PIX" | "BOLETO" | "CREDIT_CARD" | "PIX_AUTOMATIC";
  orderBumpIds?: string[]; // IDs dos order bumps aceitos
  couponCode?: string;
  idempotencyKey: string;
  affiliateCode?: string; // Código do afiliado (se houver)
  cardData?: {
    // Apenas para CREDIT_CARD
    number: string;
    holderName: string;
    expirationMonth: string;
    expirationYear: string;
    cvv: string;
    installments?: number;
  };
}

export interface ProcessCheckoutPaymentOutput {
  chargeId: string;
  status: "PENDING" | "PROCESSING";
  totalAmountCents: number;
  discountAmountCents: number;
  paymentMethod: string;
  pix?: {
    qrCode: string;
    copyPaste: string;
    expiresAt: string;
  };
  boleto?: {
    barcode: string;
    digitableLine: string;
    pdfUrl?: string;
    expiresAt: string;
  };
  creditCard?: {
    transactionId: string;
    installments: number;
    installmentAmountCents: number;
  };
  orderSummary: {
    mainProduct: {
      name: string;
      amountCents: number;
    };
    orderBumps: Array<{
      name: string;
      amountCents: number;
    }>;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  };
}

export class ProcessCheckoutPayment {
  private checkoutRepository: PrismaProductCheckoutRepository;
  private priceRepository: PrismaCoursePriceRepository;
  private couponRepository: PrismaCouponRepository;
  private chargeRepository: PrismaChargeRepository;
  private paymentProvider: PaymentProviderPort;

  constructor(
    checkoutRepository?: PrismaProductCheckoutRepository,
    priceRepository?: PrismaCoursePriceRepository,
    couponRepository?: PrismaCouponRepository,
    chargeRepository?: PrismaChargeRepository
  ) {
    this.checkoutRepository = checkoutRepository ?? new PrismaProductCheckoutRepository();
    this.priceRepository = priceRepository ?? new PrismaCoursePriceRepository();
    this.couponRepository = couponRepository ?? new PrismaCouponRepository();
    this.chargeRepository = chargeRepository ?? new PrismaChargeRepository();
    this.paymentProvider = PaymentProviderFactory.create();
  }

  async execute(input: ProcessCheckoutPaymentInput): Promise<ProcessCheckoutPaymentOutput> {
    const {
      checkoutId,
      buyer,
      paymentMethod,
      orderBumpIds = [],
      couponCode,
      idempotencyKey,
    } = input;

    logger.info({ checkoutId, buyer: { email: buyer.email }, paymentMethod }, "Processing checkout payment");

    // 1. Buscar checkout
    const checkout = await this.checkoutRepository.findById(checkoutId);
    if (!checkout) {
      throw new Error("Checkout not found");
    }

    if (!checkout.published) {
      throw new Error("Checkout not published");
    }

    // 2. Buscar preço do curso principal
    const coursePrice = await this.priceRepository.findActiveByCourseId(checkout.courseId);
    if (!coursePrice) {
      throw new Error("Course price not found");
    }

    // 3. Calcular valor dos order bumps aceitos
    let orderBumpsTotal = 0;
    const acceptedOrderBumps: Array<{ id: string; headline: string; amountCents: number }> = [];

    if (orderBumpIds.length > 0) {
      const orderBumps = await this.checkoutRepository.findOrderBumpsByCheckoutId(checkoutId);

      for (const obId of orderBumpIds) {
        const orderBump = orderBumps.find((ob) => ob.id === obId && ob.active);
        if (orderBump) {
          orderBumpsTotal += orderBump.amountCents;
          acceptedOrderBumps.push({
            id: orderBump.id,
            headline: orderBump.headline,
            amountCents: orderBump.amountCents,
          });
        }
      }
    }

    // 4. Calcular subtotal
    const subtotalCents = coursePrice.amountCents + orderBumpsTotal;

    // 5. Aplicar cupom de desconto (se houver)
    let discountCents = 0;

    if (couponCode) {
      const coupon = await this.couponRepository.findByCodeAndCourseId(couponCode, checkout.courseId);

      if (coupon && coupon.active) {
        // Verificar validade
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          throw new Error("Coupon expired");
        }

        // Verificar limite de uso
        if (coupon.maxRedemptions && coupon.redemptions >= coupon.maxRedemptions) {
          throw new Error("Coupon usage limit reached");
        }

        // Calcular desconto
        if (coupon.percentage) {
          discountCents = Math.floor((subtotalCents * coupon.percentage) / 100);
        } else if (coupon.amountCents) {
          discountCents = Math.min(coupon.amountCents, subtotalCents);
        }

        // Incrementar uso do cupom
        await this.couponRepository.incrementRedemptions(coupon.id);
      }
    }

    // 6. Calcular total final
    const totalCents = Math.max(subtotalCents - discountCents, 0);

    if (totalCents === 0) {
      throw new Error("Total amount cannot be zero");
    }

    // 7. Mapear método de pagamento para ChargeMethod
    const chargeMethod = this.mapPaymentMethod(paymentMethod);
    const externalRef = `checkout:${checkoutId}:${randomUUID()}`;

    // 8. Criar Charge no banco
    let charge = new Charge({
      merchantId: checkout.course!.merchantId,
      amountCents: totalCents,
      currency: "BRL",
      description: `Compra: ${checkout.course?.title}`,
      method: chargeMethod,
      idempotencyKey,
      externalRef,
      metadata: {
        checkoutId,
        courseId: checkout.courseId,
        buyer,
        orderBumpIds: acceptedOrderBumps.map((ob) => ob.id),
        couponCode,
        subtotalCents,
        discountCents,
        affiliateCode: input.affiliateCode,
      },
    });

    charge = await this.chargeRepository.create(charge);

    // 9. Criar cobrança na Transfeera
    let paymentData: {
      pix?: ProcessCheckoutPaymentOutput["pix"];
      boleto?: ProcessCheckoutPaymentOutput["boleto"];
      creditCard?: ProcessCheckoutPaymentOutput["creditCard"];
    } = {};

    try {
      if (paymentMethod === "PIX") {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);

        const pixResult = await this.paymentProvider.issuePixCharge({
          amountCents: totalCents,
          merchantId: checkout.course!.merchantId,
          description: `Turbofy - ${checkout.course?.title}`,
          expiresAt,
        });

        paymentData.pix = {
          qrCode: pixResult.qrCode,
          copyPaste: pixResult.copyPaste,
          expiresAt: pixResult.expiresAt.toISOString(),
        };

        // Atualizar charge com dados do Pix
        charge = charge.withPixData(pixResult.qrCode, pixResult.copyPaste);
        await this.chargeRepository.update(charge);
      } else if (paymentMethod === "BOLETO") {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3); // 3 dias

        const boletoResult = await this.paymentProvider.issueBoletoCharge({
          amountCents: totalCents,
          merchantId: checkout.course!.merchantId,
          description: `Turbofy - ${checkout.course?.title}`,
          expiresAt,
        });

        paymentData.boleto = {
          barcode: "",
          digitableLine: boletoResult.boletoUrl,
          pdfUrl: undefined,
          expiresAt: boletoResult.expiresAt.toISOString(),
        };

        // Atualizar charge com dados do Boleto
        charge = charge.withBoletoData(boletoResult.boletoUrl);
        await this.chargeRepository.update(charge);
      } else if (paymentMethod === "CREDIT_CARD") {
        // Cartão de crédito requer integração com gateway (Stripe, PagSeguro, etc)
        throw new Error("Credit card payments require additional gateway integration");
      } else if (paymentMethod === "PIX_AUTOMATIC") {
        // Pix Automático para recorrência
        throw new Error("Pix Automatic requires authorization flow");
      }
    } catch (error) {
      // Se falhar na Transfeera, marcar charge como cancelada
      charge.cancel();
      await this.chargeRepository.update(charge);
      throw error;
    }

    // 10. Incrementar conversões do checkout
    await this.checkoutRepository.incrementConversions(checkoutId);

    logger.info(
      {
        chargeId: charge.id,
        totalCents,
        paymentMethod,
      },
      "Checkout payment processed successfully"
    );

    return {
      chargeId: charge.id,
      status: "PENDING",
      totalAmountCents: totalCents,
      discountAmountCents: discountCents,
      paymentMethod,
      ...paymentData,
      orderSummary: {
        mainProduct: {
          name: checkout.course?.title ?? "Produto",
          amountCents: coursePrice.amountCents,
        },
        orderBumps: acceptedOrderBumps.map((ob) => ({
          name: ob.headline,
          amountCents: ob.amountCents,
        })),
        subtotalCents,
        discountCents,
        totalCents,
      },
    };
  }

  private mapPaymentMethod(method: string): ChargeMethod | undefined {
    switch (method) {
      case "PIX":
        return ChargeMethod.PIX;
      case "BOLETO":
        return ChargeMethod.BOLETO;
      default:
        return undefined;
    }
  }
}
