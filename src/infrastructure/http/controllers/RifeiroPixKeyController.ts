import { Request, Response } from "express";
import { z } from "zod";
import { onlyDigits } from "../../../utils/brDoc";
import { PaymentProviderError } from "../../adapters/payment/PaymentProviderErrors";
import { TransfeeraClient } from "../../adapters/payment/TransfeeraClient";
import { prisma } from "../../database/prismaClient";
import { logger } from "../../logger";

const transfeeraClient = new TransfeeraClient();

const registerSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  key: z.string().min(11, "Key must have at least 11 characters"),
});

interface PixKeyResponse {
  id: string;
  merchantId: string;
  type: string;
  key: string;
  status: string;
  verificationSource: string | null;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

/**
 * Helper para obter merchantId do usuário e validar que é Rifeiro
 */
async function ensureMerchantId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { merchantId: true },
  });

  if (!user?.merchantId) {
    throw new Error("Usuário não possui merchant associado");
  }

  return user.merchantId;
}

async function assertRifeiro(merchantId: string): Promise<void> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { type: true },
  });

  if (!merchant) {
    throw new Error("Merchant não encontrado");
  }

  if (merchant.type !== "RIFEIRO") {
    throw new Error("Apenas Rifeiros podem acessar este recurso");
  }
}

export class RifeiroPixKeyController {
  async register(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const merchantId = await ensureMerchantId(userId);
      await assertRifeiro(merchantId);

      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { document: true },
      });

      if (!merchant?.document) {
        return res.status(400).json({
          error: "DOCUMENT_NOT_FOUND",
          message: "Merchant document not found",
        });
      }

      const input = registerSchema.parse(req.body);
      const normalizedKey = onlyDigits(input.key);
      const normalizedDocument = onlyDigits(merchant.document);

      // Validação: chave deve ser igual ao documento
      if (normalizedKey !== normalizedDocument) {
        return res.status(400).json({
          error: "PIX_KEY_MISMATCH",
          message: "Chave Pix deve corresponder ao documento do merchant",
        });
      }

      logger.info({ merchantId, pixKeyType: input.type }, "Registering Rifeiro Pix key");

      // Verificar se já existe
      const prismaAny = prisma as any;
      const existing = await prismaAny.pixKey.findFirst({
        where: { merchantId },
      });

      let pixKey;
      if (existing) {
        pixKey = await prismaAny.pixKey.update({
          where: { id: existing.id },
          data: {
            type: input.type,
            key: normalizedKey,
            status: "PENDING_VERIFICATION",
            verificationSource: "INTERNAL_MATCH",
            verifiedAt: null,
            rejectedAt: null,
            rejectionReason: null,
          },
        });
      } else {
        pixKey = await prismaAny.pixKey.create({
          data: {
            merchantId,
            type: input.type,
            key: normalizedKey,
            status: "PENDING_VERIFICATION",
            verificationSource: "INTERNAL_MATCH",
          },
        });
      }

      // Validar automaticamente com Transfeera
      try {
        const validation = await transfeeraClient.createValidation("BASICA", {
          pix_key: normalizedKey,
          pix_key_type: input.type as "CPF" | "CNPJ",
          pix_key_validation: {
            cpf_cnpj: normalizedDocument,
          },
        });

        if (validation.valid) {
          pixKey = await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: {
              status: "VERIFIED",
              verifiedAt: new Date(),
              verificationSource: "TRANSFEERA_API",
            },
          });
        } else {
          const errorMessages = validation.errors.map((e) => e.message).join("; ");
          pixKey = await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: {
              status: "REJECTED",
              rejectedAt: new Date(),
              rejectionReason: errorMessages,
              verificationSource: "TRANSFEERA_API",
            },
          });
        }
      } catch (validationError) {
        logger.warn(
          { merchantId, error: validationError },
          "Failed to auto-validate Pix key with Transfeera"
        );
      }

      const response: PixKeyResponse = {
        id: pixKey.id,
        merchantId: pixKey.merchantId,
        type: pixKey.type,
        key: pixKey.key,
        status: (pixKey as any).status,
        verificationSource: (pixKey as any).verificationSource ?? null,
        verifiedAt: (pixKey as any).verifiedAt ?? null,
        rejectedAt: (pixKey as any).rejectedAt ?? null,
        rejectionReason: (pixKey as any).rejectionReason ?? null,
        createdAt: pixKey.createdAt,
      };

      return res.status(201).json(response);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error registering Rifeiro pix key");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "Invalid input data",
          details: error.issues,
        });
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("Apenas Rifeiros")) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: errorMessage,
        });
      }

      return res.status(400).json({
        error: "PIX_KEY_REGISTRATION_FAILED",
        message: errorMessage,
      });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const merchantId = await ensureMerchantId(userId);
      await assertRifeiro(merchantId);

      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { document: true },
      });

      if (!merchant?.document) {
        return res.status(400).json({
          error: "DOCUMENT_NOT_FOUND",
          message: "Merchant document not found",
        });
      }

      const pixKey = await (prisma as any).pixKey.findFirst({
        where: { merchantId },
      });

      if (!pixKey) {
        return res.status(404).json({
          error: "PIX_KEY_NOT_FOUND",
          message: "Pix key not found",
        });
      }

      const normalizedDocument = onlyDigits(merchant.document);
      const normalizedKey = onlyDigits(pixKey.key);

      if (normalizedKey !== normalizedDocument) {
        return res.status(400).json({
          error: "PIX_KEY_MISMATCH",
          message: "Pix key does not match merchant document",
        });
      }

      if (pixKey.isActive === true) {
        return res.json({
          id: pixKey.id,
          merchantId: pixKey.merchantId,
          type: pixKey.type,
          key: pixKey.key,
          status: "VERIFIED",
          verificationSource: "INTERNAL_MATCH",
          verifiedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          createdAt: pixKey.createdAt,
        });
      }

      // Validar com Transfeera
      const validation = await transfeeraClient.createValidation("BASICA", {
        pix_key: normalizedKey,
        pix_key_type: pixKey.type as "CPF" | "CNPJ",
        pix_key_validation: {
          cpf_cnpj: normalizedDocument,
        },
      });

      const prismaAny = prisma as any;
      const updated = validation.valid
        ? await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: { isActive: true, description: null },
          } as any)
        : await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: {
              isActive: false,
              description: validation.errors.map((e) => e.message).join("; "),
            },
          } as any);

      return res.json({
        id: updated.id,
        merchantId: updated.merchantId,
        type: updated.type,
        key: updated.key,
        status: updated.isActive ? "VERIFIED" : "REJECTED",
        verificationSource: "TRANSFEERA_API",
        verifiedAt: null,
        rejectedAt: null,
        rejectionReason: updated.isActive ? null : updated.description ?? null,
        createdAt: updated.createdAt,
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error verifying Rifeiro pix key");

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("not found")) {
        return res.status(404).json({
          error: "PIX_KEY_NOT_FOUND",
          message: errorMessage,
        });
      }

      return res.status(400).json({
        error: "PIX_KEY_VERIFICATION_FAILED",
        message: errorMessage,
      });
    }
  }

  async validateWithTransfeera(req: Request, res: Response) {
    // Declarar pixKeyId fora do try para usar no catch
    let pixKeyId: string | null = null;

    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const merchantId = await ensureMerchantId(userId);
      await assertRifeiro(merchantId);

      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { document: true },
      });

      if (!merchant?.document) {
        return res.status(400).json({
          error: "DOCUMENT_NOT_FOUND",
          message: "Merchant document not found",
        });
      }

      const pixKey = await (prisma as any).pixKey.findFirst({
        where: { merchantId },
      });

      if (!pixKey) {
        return res.status(404).json({
          error: "PIX_KEY_NOT_FOUND",
          message: "Pix key not found",
        });
      }

      // Guardar ID para uso no catch
      pixKeyId = pixKey.id;

      logger.info({ merchantId }, "Validating Rifeiro Pix key with Transfeera");

      const normalizedDocument = onlyDigits(merchant.document);

      const validation = await transfeeraClient.createValidation("BASICA", {
        pix_key: pixKey.key,
        pix_key_type: pixKey.type as "CPF" | "CNPJ",
        pix_key_validation: {
          cpf_cnpj: normalizedDocument,
        },
      });

      const prismaAny = prisma as any;
      const updated = validation.valid
        ? await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: { isActive: true, description: null },
          } as any)
        : await prismaAny.pixKey.update({
            where: { id: pixKey.id },
            data: {
              isActive: false,
              description: validation.errors.map((e) => e.message).join("; "),
            },
          } as any);

      return res.json({
        isValid: validation.valid,
        status: updated.isActive ? "VERIFIED" : "REJECTED",
        recipientName: validation.valid ? validation.data?.name : undefined,
        error: validation.valid ? undefined : validation.errors.map((e) => e.message).join("; "),
      });
    } catch (error) {
      logger.error(
        { error, userId: req.user?.id },
        "Error validating Rifeiro pix key with provider"
      );

      // Verificar se é erro de mTLS não configurado
      if (error instanceof PaymentProviderError) {
        if (error.code === "MTLS_NOT_CONFIGURED" || error.code === "MTLS_CERTIFICATE_REJECTED") {
          logger.error(
            { code: error.code, message: error.message },
            "mTLS configuration issue detected"
          );
          
          // Marcar como pendente (não rejeitada) - é um erro de configuração, não da chave
          if (pixKeyId) {
            try {
              await (prisma as any).pixKey.update({
                where: { id: pixKeyId },
                data: {
                  isActive: false,
                  description: "Validação temporariamente indisponível - configuração pendente",
                },
              } as any);
            } catch (updateError) {
              logger.error({ updateError, pixKeyId }, "Failed to update pixKey status on mTLS error");
            }
          }
          
          return res.status(503).json({
            error: "VALIDATION_SERVICE_UNAVAILABLE",
            message: "O serviço de validação de chave Pix está temporariamente indisponível. Por favor, entre em contato com o suporte técnico.",
            code: error.code,
            details: process.env.NODE_ENV === "development" ? error.message : undefined,
          });
        }
      }

      const messageFromProvider =
        (error as unknown as { response?: { data?: { message?: string; error?: string } }; message?: string })
          ?.response?.data?.message ||
        (error as unknown as { response?: { data?: { message?: string; error?: string } }; message?: string })
          ?.response?.data?.error ||
        (error as unknown as { message?: string })?.message ||
        "Validação indisponível. Tente novamente.";

      // Marcar como rejeitada para refletir no frontend, mas sem expor adquirente
      if (pixKeyId) {
        try {
          await (prisma as any).pixKey.update({
            where: { id: pixKeyId },
            data: {
              isActive: false,
              description: "Validação temporariamente indisponível",
            },
          } as any);
        } catch (updateError) {
          logger.error({ updateError, pixKeyId }, "Failed to update pixKey status on error");
        }
      }

      return res.status(400).json({
        error: "PIX_KEY_VALIDATION_FAILED",
        message: "Não foi possível validar a chave Pix agora. Tente novamente em alguns minutos.",
        details: process.env.NODE_ENV === "development" ? messageFromProvider : undefined,
      });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const merchantId = await ensureMerchantId(userId);
      await assertRifeiro(merchantId);

      const pixKey = await prisma.pixKey.findFirst({
        where: { merchantId },
      });

      if (!pixKey) {
        return res.status(404).json({
          error: "PIX_KEY_NOT_FOUND",
          message: "No Pix key found for this merchant",
        });
      }

      const response: PixKeyResponse = {
        id: pixKey.id,
        merchantId: pixKey.merchantId,
        type: pixKey.type,
        key: pixKey.key,
        status: (pixKey as any).status,
        verificationSource: (pixKey as any).verificationSource ?? null,
        verifiedAt: (pixKey as any).verifiedAt ?? null,
        rejectedAt: (pixKey as any).rejectedAt ?? null,
        rejectionReason: (pixKey as any).rejectionReason ?? null,
        createdAt: pixKey.createdAt,
      };

      return res.json(response);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error fetching Rifeiro pix key");

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("Apenas Rifeiros")) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: errorMessage,
        });
      }

      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Error fetching Pix key",
      });
    }
  }
}

