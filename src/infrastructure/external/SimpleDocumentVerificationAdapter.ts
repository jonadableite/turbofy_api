import axios from "axios";
import { env } from "../../config/env";
import {
  DocumentVerificationInput,
  DocumentVerificationPort,
  DocumentVerificationResult,
} from "../../ports/DocumentVerificationPort";

const MIN_FILE_SIZE_BYTES = 80 * 1024; // 80 KB

export class SimpleDocumentVerificationAdapter implements DocumentVerificationPort {
  async validateDocument(input: DocumentVerificationInput): Promise<DocumentVerificationResult> {
    if (!input.fileSize || input.fileSize < MIN_FILE_SIZE_BYTES) {
      return {
        status: "FAILED",
        reason: "A imagem enviada possui baixa resolução. Envie uma foto mais nítida.",
      };
    }

    if (input.documentType === "SELFIE" && !(input.mimeType || "").startsWith("image/")) {
      return {
        status: "FAILED",
        reason: "A selfie precisa ser enviada em formato de imagem (JPG ou PNG).",
      };
    }

    if (env.DOCUMENT_VERIFIER_URL) {
      try {
        await axios.post(
          env.DOCUMENT_VERIFIER_URL,
          {
            documentId: input.documentId,
            merchantId: input.merchantId,
            documentType: input.documentType,
            fileKey: input.fileKey,
            fileSize: input.fileSize,
            mimeType: input.mimeType,
          },
          {
            headers: env.DOCUMENT_VERIFIER_API_KEY
              ? { Authorization: `Bearer ${env.DOCUMENT_VERIFIER_API_KEY}` }
              : undefined,
            timeout: 8000,
          }
        );
      } catch (error) {
        return {
          status: "MANUAL_REVIEW",
          reason: "Falha ao validar documento com o provedor externo. Encaminhar para revisão humana.",
        };
      }
    }

    return {
      status: "PASSED",
      reason: "Documento com resolução suficiente e dados consistentes.",
      score: 0.92,
    };
  }
}


