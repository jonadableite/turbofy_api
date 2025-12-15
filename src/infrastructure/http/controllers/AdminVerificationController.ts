import { Request, Response } from "express";
import { z } from "zod";
import { AdminVerificationService } from "../../../application/services/AdminVerificationService";
import { logger } from "../../logger";

const service = new AdminVerificationService();

const approvalSchema = z.object({
  notes: z.string().max(500).optional(),
});

const rejectionSchema = z.object({
  reason: z.string().min(5, "Justificativa obrigatória"),
  notes: z.string().max(500).optional(),
});

const documentQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
});

const documentStatusSchema = z.object({
  status: z.enum(["PENDING_REVIEW", "UNDER_REVIEW", "APPROVED", "REJECTED"]),
  reason: z.string().min(5).optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (val) => (val.status === "REJECTED" ? Boolean(val.reason?.trim()) : true),
  { message: "Reason is required when rejecting a document", path: ["reason"] }
);

export class AdminVerificationController {
  async listPending(req: Request, res: Response) {
    try {
      const verifications = await service.listPendingVerifications();
      return res.status(200).json(verifications);
    } catch (error) {
      logger.error({ error }, "Error listing pending verifications");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list pending verifications",
        },
      });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const merchantId = req.params.merchantId;
      const reviewerId = req.user?.id;
      const { notes } = approvalSchema.parse(req.body ?? {});

      const profile = await service.approveMerchant(merchantId, {
        reviewerId,
        notes,
      });

      return res.status(200).json({
        merchantId: profile.merchantId,
        approvalStatus: profile.approvalStatus,
        approvalNotes: profile.approvalNotes,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid approval payload",
            details: error.issues,
          },
        });
      }

      logger.error({ error }, "Error approving merchant");
      return res.status(400).json({
        error: {
          code: "APPROVAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  async reject(req: Request, res: Response) {
    try {
      const merchantId = req.params.merchantId;
      const reviewerId = req.user?.id;
      const { reason, notes } = rejectionSchema.parse(req.body ?? {});

      const profile = await service.rejectMerchant(merchantId, reason, {
        reviewerId,
        notes,
      });

      return res.status(200).json({
        merchantId: profile.merchantId,
        approvalStatus: profile.approvalStatus,
        approvalNotes: profile.approvalNotes,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid rejection payload",
            details: error.issues,
          },
        });
      }

      logger.error({ error }, "Error rejecting merchant");
      return res.status(400).json({
        error: {
          code: "REJECTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  async listDocuments(req: Request, res: Response) {
    try {
      const filters = documentQuerySchema.parse(req.query ?? {});
      const results = await service.listDocuments(filters);
      return res.status(200).json(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query params",
            details: error.issues,
          },
        });
      }

      logger.error({ error }, "Error listing admin documents");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list documents",
        },
      });
    }
  }

  async updateDocumentStatus(req: Request, res: Response) {
    try {
      const { status, reason, notes } = documentStatusSchema.parse(req.body ?? {});
      const reviewerId = req.user?.id;
      const documentId = req.params.documentId;

      const document = await service.updateDocumentStatus(documentId, {
        reviewerId,
        status,
        reason,
        notes,
      });

      return res.status(200).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid document payload",
            details: error.issues,
          },
        });
      }

      logger.error({ error }, "Error updating document status");
      return res.status(400).json({
        error: {
          code: "DOCUMENT_STATUS_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  async getNotifications(req: Request, res: Response) {
    try {
      const summary = await service.getNotificationSummary();
      return res.status(200).json(summary);
    } catch (error) {
      logger.error({ error }, "Error fetching admin notification summary");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch notifications",
        },
      });
    }
  }
}


