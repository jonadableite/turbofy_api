import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prismaClient";
import { EmailService } from "../../infrastructure/email/EmailService";
import { logger } from "../../infrastructure/logger";

interface VerificationDecisionOptions {
  reviewerId?: string;
  notes?: string;
}

interface DocumentListOptions {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface DocumentStatusPayload extends VerificationDecisionOptions {
  status: "PENDING_REVIEW" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  reason?: string;
}

export class AdminVerificationService {
  private readonly emailService = new EmailService();

  async listPendingVerifications() {
    const profiles = await prisma.merchantProfile.findMany({
      where: {
        approvalStatus: {
          in: ["PENDING_APPROVAL", "PENDING"],
        },
      },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
            email: true,
            documents: true,
          },
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
    });

    return profiles.map((profile) => ({
      merchantId: profile.merchantId,
      approvalStatus: profile.approvalStatus,
      onboardingStep: profile.onboardingStep,
      fullName: profile.fullName,
      document: profile.document,
      updatedAt: profile.updatedAt,
      merchant: profile.merchant,
    }));
  }

  async listDocuments(options: DocumentListOptions = {}) {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const normalizedStatus = options.status?.trim().toUpperCase();
    const statusAliasMap: Record<string, string> = {
      PENDING_REVIEW: "PENDING_ANALYSIS",
      PENDING: "PENDING_ANALYSIS",
      IN_ANALYSIS: "PENDING_ANALYSIS",
      UNDER_REVIEW: "PENDING_ANALYSIS",
    };
    const normalizedType = options.type?.trim().toUpperCase();
    const search = options.search?.trim();

    const where: Prisma.MerchantDocumentWhereInput = {};

    if (normalizedStatus) {
      where.status = statusAliasMap[normalizedStatus] ?? normalizedStatus;
    }

    if (normalizedType) {
      where.type = normalizedType;
    }

    if (search) {
      where.OR = [
        { merchant: { name: { contains: search, mode: "insensitive" } } },
        { merchant: { email: { contains: search, mode: "insensitive" } } },
        { type: { contains: search, mode: "insensitive" } },
      ];
    }

    const [documents, total] = await prisma.$transaction([
      prisma.merchantDocument.findMany({
        where,
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: {
                select: {
                  approvalStatus: true,
                  onboardingStep: true,
                },
              },
            },
          },
        },
        orderBy: [
          { status: "asc" },
          { updatedAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.merchantDocument.count({ where }),
    ]);

    // Se não há documentos e o status é PENDING_REVIEW, buscar merchants em PENDING_APPROVAL sem documentos
    if (normalizedStatus === "PENDING_REVIEW" && documents.length === 0 && !search) {
      const merchantsWithoutDocuments = await prisma.merchantProfile.findMany({
        where: {
          approvalStatus: { in: ["PENDING_APPROVAL", "PENDING"] },
          merchant: {
            documents: {
              none: {},
            },
          },
        },
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: {
                select: {
                  approvalStatus: true,
                  onboardingStep: true,
                },
              },
            },
          },
        },
        take: pageSize,
        orderBy: { updatedAt: "desc" },
      });

      // Criar documentos "virtuais" para mostrar no admin
      const virtualDocuments = merchantsWithoutDocuments.map((profile) => ({
        id: `virtual-${profile.merchantId}`,
        merchantId: profile.merchantId,
        type: "DOCUMENTOS_PENDENTES",
        url: "",
        status: "PENDING_REVIEW",
        rejectionReason: null,
        mimeType: null,
        fileSize: null,
        reviewedBy: null,
        reviewedAt: null,
        verificationNotes: "Merchant enviou cadastro para análise mas não enviou fotos dos documentos",
        createdAt: profile.updatedAt,
        updatedAt: profile.updatedAt,
        merchant: profile.merchant,
      }));

      return {
        data: virtualDocuments,
        total: virtualDocuments.length,
        page,
        pageSize,
      };
    }

    return {
      data: documents,
      total,
      page,
      pageSize,
    };
  }

  async approveMerchant(merchantId: string, options: VerificationDecisionOptions = {}) {
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantId },
      include: {
        merchant: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!profile) {
      throw new Error("Merchant profile not found");
    }
    if (profile.approvalStatus === "APPROVED") {
      return profile;
    }

    const now = new Date();

    const updatedProfile = await prisma.$transaction(async (tx) => {
      const profileUpdate = await tx.merchantProfile.update({
        where: { merchantId },
        data: {
          approvalStatus: "APPROVED",
          approvalNotes: options.notes ?? null,
        },
      });

      await tx.merchantDocument.updateMany({
        where: { merchantId },
        data: {
          status: "APPROVED",
          rejectionReason: null,
          reviewedBy: options.reviewerId ?? null,
          reviewedAt: now,
          verificationNotes: options.notes ?? null,
        },
      });

      return profileUpdate;
    });

    if (profile.merchant?.email) {
      await this.emailService.sendOnboardingStatusEmail(
        profile.merchant.email,
        "APPROVED",
        undefined,
        profile.merchant.name ?? undefined
      );
    }

    logger.info(
      { merchantId, reviewerId: options.reviewerId, notes: options.notes },
      "Merchant onboarding approved"
    );

    return updatedProfile;
  }

  async rejectMerchant(merchantId: string, reason: string, options: VerificationDecisionOptions = {}) {
    if (!reason?.trim()) {
      throw new Error("Rejection reason is required");
    }

    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantId },
      include: {
        merchant: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!profile) {
      throw new Error("Merchant profile not found");
    }

    const now = new Date();

    const updatedProfile = await prisma.$transaction(async (tx) => {
      const profileUpdate = await tx.merchantProfile.update({
        where: { merchantId },
        data: {
          approvalStatus: "REJECTED",
          approvalNotes: reason,
        },
      });

      await tx.merchantDocument.updateMany({
        where: { merchantId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          reviewedBy: options.reviewerId ?? null,
          reviewedAt: now,
          verificationNotes: options.notes ?? reason,
        },
      });

      return profileUpdate;
    });

    if (profile.merchant?.email) {
      await this.emailService.sendOnboardingStatusEmail(
        profile.merchant.email,
        "REJECTED",
        reason,
        profile.merchant.name ?? undefined
      );
    }

    logger.warn(
      { merchantId, reviewerId: options.reviewerId, reason },
      "Merchant onboarding rejected"
    );

    return updatedProfile;
  }

  async updateDocumentStatus(documentId: string, payload: DocumentStatusPayload) {
    // Verificar se é um documento virtual (merchant sem documentos)
    if (documentId.startsWith("virtual-")) {
      const merchantId = documentId.replace("virtual-", "");
      const profile = await prisma.merchantProfile.findUnique({
        where: { merchantId },
        include: {
          merchant: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      if (!profile) {
        throw new Error("Merchant not found");
      }

      // Se está rejeitando, atualizar o profile com o motivo
      if (payload.status === "REJECTED") {
        const rejectionReason = payload.reason ?? payload.notes ?? "Faltam fotos dos documentos. Por favor, envie as fotos do documento (frente e verso) e a selfie com documento.";
        
        await prisma.merchantProfile.update({
          where: { merchantId },
          data: {
            approvalStatus: "REJECTED",
            approvalNotes: rejectionReason,
          },
        });

        if (profile.merchant?.email) {
          await this.emailService.sendOnboardingStatusEmail(
            profile.merchant.email,
            "REJECTED",
            rejectionReason,
            profile.merchant.name ?? undefined
          );
        }

        logger.warn(
          { merchantId, reviewerId: payload.reviewerId, reason: rejectionReason },
          "Merchant onboarding rejected - missing documents"
        );

        return {
          id: documentId,
          merchantId,
          type: "DOCUMENTOS_PENDENTES",
          status: "REJECTED",
          rejectionReason,
          verificationNotes: payload.notes ?? null,
          reviewedBy: payload.reviewerId ?? null,
          reviewedAt: new Date(),
        };
      }

      throw new Error("Apenas rejeição é permitida para merchants sem documentos enviados");
    }

    const document = await prisma.merchantDocument.findUnique({
      where: { id: documentId },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            name: true,
            profile: {
              select: {
                approvalStatus: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const now = new Date();
    const rejectionReason = payload.status === "REJECTED"
      ? payload.reason ?? payload.notes ?? "Documento rejeitado"
      : null;

    const updatedDocument = await prisma.merchantDocument.update({
      where: { id: documentId },
      data: {
        status: payload.status,
        reviewedAt: now,
        reviewedBy: payload.reviewerId ?? null,
        verificationNotes: payload.notes ?? null,
        rejectionReason,
      },
    });

    if (payload.status === "REJECTED") {
      await prisma.merchantProfile.update({
        where: { merchantId: document.merchantId },
        data: {
          approvalStatus: "REJECTED",
          approvalNotes: rejectionReason,
        },
      });
    }

    if (payload.status === "APPROVED") {
      const remainingDocuments = await prisma.merchantDocument.count({
        where: {
          merchantId: document.merchantId,
          status: {
            notIn: ["APPROVED"],
          },
        },
      });

      if (remainingDocuments === 0) {
        await prisma.merchantProfile.update({
          where: { merchantId: document.merchantId },
          data: {
            approvalStatus: document.merchant.profile?.approvalStatus === "APPROVED"
              ? "APPROVED"
              : "PENDING_APPROVAL",
          },
        });
      }
    }

    await this.notifyDocumentStatusEmail({
      email: document.merchant.email,
      name: document.merchant.name,
      documentType: document.type,
      status: payload.status,
      reason: rejectionReason || payload.notes,
    });

    logger.info(
      { documentId, merchantId: document.merchantId, status: payload.status, reviewerId: payload.reviewerId },
      "Document status updated"
    );

    return updatedDocument;
  }

  private async notifyDocumentStatusEmail(params: {
    email?: string | null;
    name?: string | null;
    documentType: string;
    status: string;
    reason?: string | null;
  }): Promise<void> {
    if (!params.email) {
      return;
    }

    await this.emailService.sendDocumentStatusEmail(params.email, {
      merchantName: params.name ?? undefined,
      documentType: params.documentType,
      status: params.status,
      reason: params.reason ?? undefined,
    });
  }

  async getNotificationSummary() {
    const pendingStatuses = ["PENDING", "PENDING_REVIEW", "UNDER_REVIEW"];
    const [pendingDocuments, rejectedDocuments, merchantsAwaitingApproval, latestDocument, recentDocuments] = await Promise.all([
      prisma.merchantDocument.count({ where: { status: { in: pendingStatuses } } }),
      prisma.merchantDocument.count({ where: { status: "REJECTED" } }),
      prisma.merchantProfile.count({
        where: {
          approvalStatus: { in: ["PENDING", "PENDING_APPROVAL"] },
        },
      }),
      prisma.merchantDocument.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.merchantDocument.findMany({
        where: { status: { in: pendingStatuses } },
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
      pendingDocuments,
      rejectedDocuments,
      merchantsAwaitingApproval,
      lastUpdatedAt: latestDocument?.updatedAt ?? null,
      recentDocuments,
    };
  }
}


