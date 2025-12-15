
import { Request, Response } from "express";
import { z } from "zod";
import { OnboardingService } from "../../../application/services/OnboardingService";
import { logger } from "../../logger";
import { GenerateUploadUrl } from "../../../application/use-cases/GenerateUploadUrl";
import { ConfirmDocumentUpload } from "../../../application/use-cases/ConfirmDocumentUpload";
import { SubmitForAnalysis } from "../../../application/use-cases/SubmitForAnalysis";
import { S3StorageAdapter } from "../../adapters/storage/S3StorageAdapter";
import { PrismaMerchantDocumentRepository } from "../../repositories/PrismaMerchantDocumentRepository";
import { PrismaMerchantProfileRepository } from "../../repositories/PrismaMerchantProfileRepository";
import { prisma } from "../../database/prismaClient";
import { env } from "../../../config/env";
import { MessagingFactory } from "../../adapters/messaging/MessagingFactory";

const service = new OnboardingService();

// Setup Dependencies
const s3Adapter = new S3StorageAdapter(env.STORAGE_BUCKET_NAME);
const docRepo = new PrismaMerchantDocumentRepository(prisma);
const profileRepo = new PrismaMerchantProfileRepository(prisma);
const messaging = MessagingFactory.create();

const generateUploadUrl = new GenerateUploadUrl(s3Adapter);
const confirmDocumentUpload = new ConfirmDocumentUpload(docRepo, s3Adapter, messaging);
const submitForAnalysis = new SubmitForAnalysis(profileRepo, docRepo);

const personalDataSchema = z.object({
    fullName: z.string().min(3),
    document: z.string().min(11), // CPF/CNPJ
    phone: z.string().min(10),
    birthDate: z.string().optional(), // ISO date string
    revenueLast12Months: z.string().optional(),
    projectedRevenue: z.string().optional(),
});

const addressSchema = z.object({
    zipCode: z.string().min(8),
    street: z.string().min(3),
    number: z.string().min(1),
    complement: z.string().optional(),
    neighborhood: z.string().min(2),
    city: z.string().min(2),
    state: z.string().length(2),
    country: z.string().default("Brasil"),
});

const uploadUrlSchema = z.object({
    documentType: z.enum(['RG_FRONT', 'RG_BACK', 'SELFIE']),
    contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
});

const confirmUploadSchema = z.object({
    documentType: z.enum(['RG_FRONT', 'RG_BACK', 'SELFIE']),
    key: z.string(),
});

export class OnboardingController {
    async getStatus(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            const status = await service.getStatus(merchantId);
            return res.json(status);
        } catch (error) {
            logger.error({ error }, "Error getting onboarding status");
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async updatePersonalData(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            const data = personalDataSchema.parse(req.body);
            const result = await service.updatePersonalData(merchantId, data);

            return res.json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: "Validation error", details: error.issues });
            }
            logger.error({ error: error instanceof Error ? error.message : error, stack: error instanceof Error ? error.stack : undefined }, "Error updating personal data");
            return res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
        }
    }

    async updateAddress(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            const data = addressSchema.parse(req.body);
            const result = await service.updateAddress(merchantId, data);

            return res.json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: "Validation error", details: error.issues });
            }
            logger.error({ error }, "Error updating address");
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async complete(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            // Use the new Use Case
            await submitForAnalysis.execute(merchantId);
            
            // Also call legacy service if it does extra steps (like returning updated profile)
            // service.completeOnboarding does mostly the same, but Use Case is cleaner.
            // Let's just return success message.
            
            return res.json({ message: "Onboarding submitted for analysis" });
        } catch (error) {
            logger.error({ error }, "Error completing onboarding");
            return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
        }
    }

    // New Methods

    async getUploadUrl(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            const input = uploadUrlSchema.parse(req.body);
            const result = await generateUploadUrl.execute({
                merchantId,
                documentType: input.documentType,
                contentType: input.contentType,
            });

            return res.json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: "Validation error", details: error.issues });
            }
            logger.error({ error }, "Error generating upload URL");
            return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
        }
    }

    async confirmUpload(req: Request, res: Response) {
        try {
            const merchantId = req.user?.merchantId;
            if (!merchantId) return res.status(400).json({ error: "Merchant ID not found" });

            const input = confirmUploadSchema.parse(req.body);
            await confirmDocumentUpload.execute({
                merchantId,
                documentType: input.documentType,
                key: input.key,
            });

            return res.json({ success: true });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: "Validation error", details: error.issues });
            }
            logger.error({ error }, "Error confirming upload");
            return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
        }
    }
}
