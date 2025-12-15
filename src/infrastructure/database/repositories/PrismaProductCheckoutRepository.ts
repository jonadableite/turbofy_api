import { prisma } from "../prismaClient";
import { ProductCheckout, OrderBump, UpsellOffer, UpsellType, UpsellTrigger, Prisma } from "@prisma/client";

export interface CreateProductCheckoutData {
  courseId: string;
  name: string;
  slug: string;
  isDefault?: boolean;
  builderConfig?: Prisma.InputJsonValue;
  themeConfig?: Prisma.InputJsonValue;
  settings?: Prisma.InputJsonValue;
}

export interface UpdateProductCheckoutData {
  name?: string;
  slug?: string;
  isDefault?: boolean;
  published?: boolean;
  builderConfig?: Prisma.InputJsonValue;
  themeConfig?: Prisma.InputJsonValue;
  settings?: Prisma.InputJsonValue;
}

export interface CreateOrderBumpData {
  checkoutId: string;
  courseId: string;
  headline: string;
  description?: string;
  amountCents: number;
  position?: number;
}

export interface UpdateOrderBumpData {
  headline?: string;
  description?: string;
  amountCents?: number;
  position?: number;
  active?: boolean;
}

export interface CreateUpsellOfferData {
  checkoutId: string;
  type: UpsellType;
  courseId: string;
  headline: string;
  description?: string;
  videoUrl?: string;
  amountCents: number;
  triggerAfter: UpsellTrigger;
  position?: number;
}

export interface UpdateUpsellOfferData {
  headline?: string;
  description?: string;
  videoUrl?: string;
  amountCents?: number;
  triggerAfter?: UpsellTrigger;
  position?: number;
  active?: boolean;
}

export type ProductCheckoutWithRelations = ProductCheckout & {
  orderBumps: OrderBump[];
  upsells: UpsellOffer[];
  course?: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    merchantId: string;
    prices: Array<{
      amountCents: number;
      type: string;
      active: boolean;
    }>;
  };
};

export class PrismaProductCheckoutRepository {
  // ============================================
  // ProductCheckout CRUD
  // ============================================

  async create(data: CreateProductCheckoutData): Promise<ProductCheckout> {
    // Se for default, remover default dos outros checkouts do mesmo curso
    if (data.isDefault) {
      await prisma.productCheckout.updateMany({
        where: { courseId: data.courseId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.productCheckout.create({
      data: {
        courseId: data.courseId,
        name: data.name,
        slug: data.slug,
        isDefault: data.isDefault ?? false,
        builderConfig: data.builderConfig ?? {},
        themeConfig: data.themeConfig,
        settings: data.settings,
      },
    });
  }

  async findById(id: string): Promise<ProductCheckoutWithRelations | null> {
    return prisma.productCheckout.findUnique({
      where: { id },
      include: {
        orderBumps: {
          orderBy: { position: "asc" },
        },
        upsells: {
          orderBy: { position: "asc" },
        },
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            merchantId: true,
            prices: {
              where: { active: true },
              select: {
                amountCents: true,
                type: true,
                active: true,
              },
            },
          },
        },
      },
    });
  }

  async findBySlug(slug: string): Promise<ProductCheckoutWithRelations | null> {
    return prisma.productCheckout.findUnique({
      where: { slug },
      include: {
        orderBumps: {
          where: { active: true },
          orderBy: { position: "asc" },
        },
        upsells: {
          where: { active: true },
          orderBy: { position: "asc" },
        },
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            merchantId: true,
            prices: {
              where: { active: true },
              select: {
                amountCents: true,
                type: true,
                active: true,
              },
            },
          },
        },
      },
    });
  }

  async findByCourseId(courseId: string): Promise<ProductCheckout[]> {
    return prisma.productCheckout.findMany({
      where: { courseId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async findByMerchantId(merchantId: string): Promise<ProductCheckoutWithRelations[]> {
    return prisma.productCheckout.findMany({
      where: {
        course: {
          merchantId,
        },
      },
      include: {
        orderBumps: {
          orderBy: { position: "asc" },
        },
        upsells: {
          orderBy: { position: "asc" },
        },
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            merchantId: true,
            prices: {
              where: { active: true },
              select: {
                amountCents: true,
                type: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });
  }

  async findDefaultByCourseId(courseId: string): Promise<ProductCheckout | null> {
    return prisma.productCheckout.findFirst({
      where: { courseId, isDefault: true },
    });
  }

  async update(id: string, data: UpdateProductCheckoutData): Promise<ProductCheckout> {
    // Se for definir como default, remover default dos outros
    if (data.isDefault) {
      const checkout = await prisma.productCheckout.findUnique({
        where: { id },
        select: { courseId: true },
      });

      if (checkout) {
        await prisma.productCheckout.updateMany({
          where: { courseId: checkout.courseId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
    }

    return prisma.productCheckout.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.published !== undefined && { published: data.published }),
        ...(data.builderConfig && { builderConfig: data.builderConfig }),
        ...(data.themeConfig !== undefined && { themeConfig: data.themeConfig }),
        ...(data.settings !== undefined && { settings: data.settings }),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.productCheckout.delete({ where: { id } });
  }

  async duplicate(id: string, newName: string, newSlug: string): Promise<ProductCheckout> {
    const original = await this.findById(id);
    if (!original) {
      throw new Error("Checkout not found");
    }

    return prisma.productCheckout.create({
      data: {
        courseId: original.courseId,
        name: newName,
        slug: newSlug,
        isDefault: false,
        published: false,
        builderConfig: original.builderConfig as Prisma.InputJsonValue,
        themeConfig: original.themeConfig as Prisma.InputJsonValue,
        settings: original.settings as Prisma.InputJsonValue,
      },
    });
  }

  async incrementVisits(id: string): Promise<void> {
    await prisma.productCheckout.update({
      where: { id },
      data: { visits: { increment: 1 } },
    });
  }

  async incrementConversions(id: string): Promise<void> {
    await prisma.productCheckout.update({
      where: { id },
      data: { conversions: { increment: 1 } },
    });
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const checkout = await prisma.productCheckout.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!checkout) return false;
    if (excludeId && checkout.id === excludeId) return false;
    return true;
  }

  // ============================================
  // OrderBump CRUD
  // ============================================

  async createOrderBump(data: CreateOrderBumpData): Promise<OrderBump> {
    return prisma.orderBump.create({
      data: {
        checkoutId: data.checkoutId,
        courseId: data.courseId,
        headline: data.headline,
        description: data.description,
        amountCents: data.amountCents,
        position: data.position ?? 0,
      },
    });
  }

  async findOrderBumpById(id: string): Promise<OrderBump | null> {
    return prisma.orderBump.findUnique({ where: { id } });
  }

  async findOrderBumpsByCheckoutId(checkoutId: string): Promise<OrderBump[]> {
    return prisma.orderBump.findMany({
      where: { checkoutId },
      orderBy: { position: "asc" },
    });
  }

  async updateOrderBump(id: string, data: UpdateOrderBumpData): Promise<OrderBump> {
    return prisma.orderBump.update({
      where: { id },
      data: {
        ...(data.headline && { headline: data.headline }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amountCents && { amountCents: data.amountCents }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async deleteOrderBump(id: string): Promise<void> {
    await prisma.orderBump.delete({ where: { id } });
  }

  // ============================================
  // UpsellOffer CRUD
  // ============================================

  async createUpsellOffer(data: CreateUpsellOfferData): Promise<UpsellOffer> {
    return prisma.upsellOffer.create({
      data: {
        checkoutId: data.checkoutId,
        type: data.type,
        courseId: data.courseId,
        headline: data.headline,
        description: data.description,
        videoUrl: data.videoUrl,
        amountCents: data.amountCents,
        triggerAfter: data.triggerAfter,
        position: data.position ?? 0,
      },
    });
  }

  async findUpsellOfferById(id: string): Promise<UpsellOffer | null> {
    return prisma.upsellOffer.findUnique({ where: { id } });
  }

  async findUpsellOffersByCheckoutId(checkoutId: string): Promise<UpsellOffer[]> {
    return prisma.upsellOffer.findMany({
      where: { checkoutId },
      orderBy: { position: "asc" },
    });
  }

  async updateUpsellOffer(id: string, data: UpdateUpsellOfferData): Promise<UpsellOffer> {
    return prisma.upsellOffer.update({
      where: { id },
      data: {
        ...(data.headline && { headline: data.headline }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
        ...(data.amountCents && { amountCents: data.amountCents }),
        ...(data.triggerAfter && { triggerAfter: data.triggerAfter }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async deleteUpsellOffer(id: string): Promise<void> {
    await prisma.upsellOffer.delete({ where: { id } });
  }

  // ============================================
  // Public Checkout Query (para /c/:slug)
  // ============================================

  async findPublicCheckout(slug: string) {
    const checkout = await prisma.productCheckout.findUnique({
      where: { slug, published: true },
      include: {
        orderBumps: {
          where: { active: true },
          orderBy: { position: "asc" },
          include: {
            // Nota: não há relação direta com Course no OrderBump
            // Precisamos fazer query separada se necessário
          },
        },
        upsells: {
          where: { active: true },
          orderBy: { position: "asc" },
        },
        course: {
          include: {
            merchant: {
              select: {
                name: true,
              },
              include: {
                domainConfig: {
                  select: {
                    logoUrl: true,
                  },
                },
              },
            },
            prices: {
              where: { active: true },
              take: 1,
            },
          },
        },
      },
    });

    return checkout;
  }
}

