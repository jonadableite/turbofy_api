import { Request, Response } from "express";
import { z } from "zod";
import { SubmitKycDocumentsUseCase } from "../../../application/useCases/kyc/SubmitKycDocumentsUseCase";
import { ApproveKycUseCase } from "../../../application/useCases/kyc/ApproveKycUseCase";
import { RejectKycUseCase } from "../../../application/useCases/kyc/RejectKycUseCase";
import { GetOnboardingStatusUseCase } from "../../../application/useCases/kyc/GetOnboardingStatusUseCase";
import { PrismaUserKycRepository } from "../../database/PrismaUserKycRepository";
import { logger } from "../../logger";

const kycRepository = new PrismaUserKycRepository();
const submitKyc = new SubmitKycDocumentsUseCase(kycRepository);
const approveKyc = new ApproveKycUseCase(kycRepository);
const rejectKyc = new RejectKycUseCase(kycRepository);
const getStatus = new GetOnboardingStatusUseCase(kycRepository);

const documentsSchema = z.object({
  documents: z
    .array(
      z.object({
        type: z.enum(["ID_FRONT", "ID_BACK", "SELFIE", "PROOF_OF_ADDRESS"]),
        url: z.string().url(),
      })
    )
    .min(1),
});

export class KycController {
  async submit(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const body = documentsSchema.parse(req.body);
      const submission = await submitKyc.execute({
        userId,
        documents: body.documents,
      });
      return res.status(201).json(submission);
    } catch (error) {
      logger.error({ error }, "Error submitting KYC");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.issues });
      }
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async status(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const status = await getStatus.execute({ userId });
      return res.json(status);
    } catch (error) {
      logger.error({ error }, "Error getting KYC status");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const adminId = req.user?.id;
      if (!adminId || !req.user?.roles?.includes("ADMIN")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const submissionId = req.params.id;
      await approveKyc.execute({ submissionId, adminUserId: adminId });
      return res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Error approving KYC");
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  async reject(req: Request, res: Response) {
    try {
      const adminId = req.user?.id;
      if (!adminId || !req.user?.roles?.includes("ADMIN")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const submissionId = req.params.id;
      const body = z.object({ reason: z.string().min(3) }).parse(req.body);
      await rejectKyc.execute({
        submissionId,
        adminUserId: adminId,
        reason: body.reason,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Error rejecting KYC");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.issues });
      }
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}

