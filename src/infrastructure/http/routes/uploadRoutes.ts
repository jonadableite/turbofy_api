/**
 * Rotas para upload de arquivos (logo, banner, favicon)
 * 
 * @security Validação de tipo e tamanho de arquivo
 * @maintainability Separação de concerns
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/authMiddleware";
import { logger } from "../../logger";
import rateLimit from "express-rate-limit";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { prisma } from "../../database/prismaClient";

export const uploadRouter = Router();

const isDevelopment = process.env.NODE_ENV === "development";
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: isDevelopment ? 20 : 10,
  message: "Too many upload requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const DOCUMENT_STATUS_PENDING = "PENDING_REVIEW";
const DOCUMENT_TYPE_PATTERN = /^(RG|CNH|RNE|SELFIE|PASSPORT|CNPJ_CARD)(_(FRONT|BACK))?$/i;

// Configurar storage do multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

// Filtros de arquivo
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg|ico|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("Only image or PDF files are allowed"));
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter,
});

/**
 * POST /upload/logo
 * Upload de logo
 */
uploadRouter.post(
  "/logo",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:8080";
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

      logger.info(
        { merchantId: req.user?.merchantId, filename: req.file.filename },
        "Logo uploaded successfully"
      );

      return res.status(200).json({
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage }, "Error uploading logo");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to upload logo",
        },
      });
    }
  }
);

/**
 * POST /upload/banner
 * Upload de banner
 */
uploadRouter.post(
  "/banner",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:8080";
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

      logger.info(
        { merchantId: req.user?.merchantId, filename: req.file.filename },
        "Banner uploaded successfully"
      );

      return res.status(200).json({
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage }, "Error uploading banner");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to upload banner",
        },
      });
    }
  }
);

/**
 * POST /upload/favicon
 * Upload de favicon
 */
uploadRouter.post(
  "/favicon",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:8080";
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

      logger.info(
        { merchantId: req.user?.merchantId, filename: req.file.filename },
        "Favicon uploaded successfully"
      );

      return res.status(200).json({
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage }, "Error uploading favicon");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to upload favicon",
        },
      });
    }
  }
);

/**
 * POST /upload/document
 * Upload de documento de identificação
 */
uploadRouter.post(
  "/document",
  authMiddleware,
  uploadLimiter,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const merchantId = req.user?.merchantId;
      if (!merchantId) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Merchant ID not found",
          },
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      const rawDocumentType = typeof req.body?.type === "string" ? req.body.type : "";
      const documentType = rawDocumentType.trim().toUpperCase();

      if (!documentType) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Document type is required",
          },
        });
      }

      if (!DOCUMENT_TYPE_PATTERN.test(documentType)) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: `Unsupported document type: ${documentType}`,
          },
        });
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:8080";
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

      logger.info(
        { merchantId, filename: req.file.filename },
        "Document uploaded successfully"
      );

      const document = await prisma.merchantDocument.upsert({
        where: {
          merchantId_type: {
            merchantId,
            type: documentType,
          },
        },
        create: {
          merchantId,
          type: documentType,
          url: fileUrl,
          status: DOCUMENT_STATUS_PENDING,
          rejectionReason: null,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
        },
        update: {
          url: fileUrl,
          status: DOCUMENT_STATUS_PENDING,
          rejectionReason: null,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          reviewedAt: null,
          reviewedBy: null,
          verificationNotes: null,
        },
      });

      await ensureOnboardingStep(merchantId, 3);

      return res.status(200).json({
        id: document.id,
        url: document.url,
        filename: req.file.filename,
        size: req.file.size,
        type: document.type,
        status: document.status,
        mimeType: document.mimeType,
        updatedAt: document.updatedAt.toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage }, "Error uploading document");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to upload document",
        },
      });
    }
  }
);

const ensureOnboardingStep = async (merchantId: string, minStep: number): Promise<void> => {
  const profile = await prisma.merchantProfile.findUnique({
    where: { merchantId },
    select: { onboardingStep: true },
  });

  if (!profile) {
    await prisma.merchantProfile.create({
      data: {
        merchantId,
        onboardingStep: minStep,
      },
    });
    return;
  }

  if ((profile.onboardingStep ?? 0) < minStep) {
    await prisma.merchantProfile.update({
      where: { merchantId },
      data: { onboardingStep: minStep },
    });
  }
};

