import { Request, Response } from "express";
import { z } from "zod";
import { RegisterPixKeyUseCase } from "../../../application/useCases/pixKey/RegisterPixKeyUseCase";
import { VerifyPixKeyUseCase } from "../../../application/useCases/pixKey/VerifyPixKeyUseCase";
import { ValidatePixKeyWithTransfeeraUseCase } from "../../../application/useCases/pixKey/ValidatePixKeyWithTransfeeraUseCase";
import { PrismaUserPixKeyRepository } from "../../database/PrismaUserPixKeyRepository";
import { TransfeeraClient } from "../../adapters/payment/TransfeeraClient";
import { logger } from "../../logger";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";

const pixKeyRepository = new PrismaUserPixKeyRepository();
const transfeeraClient = new TransfeeraClient();
const registerPixKey = new RegisterPixKeyUseCase(pixKeyRepository, transfeeraClient);
const verifyPixKey = new VerifyPixKeyUseCase(pixKeyRepository, transfeeraClient);
const validateTransfeera = new ValidatePixKeyWithTransfeeraUseCase(pixKeyRepository, transfeeraClient);

const registerSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  key: z.string().min(11, "Key must have at least 11 characters"),
});

interface PixKeyResponse {
  id: string;
  userId: string;
  type: string;
  key: string;
  status: PixKeyStatus;
  verificationSource: string | null;
  verifiedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

export class PixKeyController {
  async register(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const input = registerSchema.parse(req.body);

      logger.info(
        { userId, pixKeyType: input.type },
        "Registering Pix key"
      );

      const result = await registerPixKey.execute({
        userId,
        type: input.type,
        key: input.key,
      });

      const response: PixKeyResponse = {
        id: result.id,
        userId: result.userId,
        type: result.type,
        key: result.key,
        status: result.status as PixKeyStatus,
        verificationSource: result.verificationSource ?? null,
        verifiedAt: result.verifiedAt ?? null,
        rejectedAt: result.rejectedAt ?? null,
        rejectionReason: result.rejectionReason ?? null,
        createdAt: result.createdAt,
      };

      logger.info(
        { userId, pixKeyId: result.id, status: result.status },
        "Pix key registered successfully"
      );

      return res.status(201).json(response);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error registering pix key");

      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "VALIDATION_ERROR", 
          message: "Invalid input data",
          details: error.issues 
        });
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("KYC not approved")) {
        return res.status(403).json({ 
          error: "KYC_NOT_APPROVED", 
          message: "KYC must be approved before registering Pix key" 
        });
      }

      if (errorMessage.includes("already verified")) {
        return res.status(409).json({ 
          error: "PIX_KEY_ALREADY_VERIFIED", 
          message: errorMessage 
        });
      }

      if (errorMessage.includes("must match")) {
        return res.status(400).json({ 
          error: "PIX_KEY_VALIDATION_ERROR", 
          message: errorMessage 
        });
      }

      return res.status(400).json({ 
        error: "PIX_KEY_REGISTRATION_FAILED", 
        message: errorMessage 
      });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      logger.info({ userId }, "Verifying Pix key");

      const result = await verifyPixKey.execute({ userId });

      const response: PixKeyResponse = {
        id: result.id,
        userId: result.userId,
        type: result.type,
        key: result.key,
        status: result.status as PixKeyStatus,
        verificationSource: result.verificationSource ?? null,
        verifiedAt: result.verifiedAt ?? null,
        rejectedAt: result.rejectedAt ?? null,
        rejectionReason: result.rejectionReason ?? null,
        createdAt: result.createdAt,
      };

      logger.info(
        { userId, pixKeyId: result.id, status: result.status },
        "Pix key verified"
      );

      return res.json(response);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error verifying pix key");

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ 
          error: "PIX_KEY_NOT_FOUND", 
          message: errorMessage 
        });
      }

      if (errorMessage.includes("does not match")) {
        return res.status(400).json({ 
          error: "PIX_KEY_MISMATCH", 
          message: errorMessage 
        });
      }

      return res.status(400).json({ 
        error: "PIX_KEY_VERIFICATION_FAILED", 
        message: errorMessage 
      });
    }
  }

  async validateWithTransfeera(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      logger.info({ userId }, "Validating Pix key with Transfeera");

      const result = await validateTransfeera.execute({ userId });

      logger.info(
        { userId, isValid: result.isValid, status: result.status },
        "Pix key validation with Transfeera completed"
      );

      return res.json({
        isValid: result.isValid,
        status: result.status,
        recipientName: result.recipientName,
        error: result.error,
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error validating pix key with Transfeera");

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ 
          error: "PIX_KEY_NOT_FOUND", 
          message: errorMessage 
        });
      }

      return res.status(500).json({ 
        error: "TRANSFEERA_VALIDATION_FAILED", 
        message: errorMessage 
      });
    }
  }

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ 
          error: "UNAUTHORIZED", 
          message: "User not authenticated" 
        });
      }

      const pixKey = await pixKeyRepository.findByUserId(userId);

      if (!pixKey) {
        return res.status(404).json({ 
          error: "PIX_KEY_NOT_FOUND", 
          message: "No Pix key found for this user" 
        });
      }

      const response: PixKeyResponse = {
        id: pixKey.id,
        userId: pixKey.userId,
        type: pixKey.type,
        key: pixKey.key,
        status: pixKey.status as PixKeyStatus,
        verificationSource: pixKey.verificationSource ?? null,
        verifiedAt: pixKey.verifiedAt ?? null,
        rejectedAt: pixKey.rejectedAt ?? null,
        rejectionReason: pixKey.rejectionReason ?? null,
        createdAt: pixKey.createdAt,
      };

      return res.json(response);
    } catch (error) {
      logger.error({ error, userId: req.user?.id }, "Error fetching pix key");
      return res.status(500).json({ 
        error: "INTERNAL_SERVER_ERROR", 
        message: "Error fetching Pix key" 
      });
    }
  }
}

