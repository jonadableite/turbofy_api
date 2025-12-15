/**
 * Serviço para validação de Google reCAPTCHA v3
 */

import { logger } from "../logger";
import { env } from "../../config/env";

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5; // Score mínimo aceito (0.0 = bot, 1.0 = humano)

/**
 * Valida um token reCAPTCHA v3
 * @param token Token recebido do frontend
 * @param remoteIp IP do cliente (opcional, mas recomendado)
 * @returns true se válido, false caso contrário
 */
export async function verifyRecaptcha(
  token: string,
  remoteIp?: string
): Promise<boolean> {
  if (!env.RECAPTCHA_SECRET_KEY) {
    logger.warn("RECAPTCHA_SECRET_KEY not configured, skipping validation");
    return true; // Em desenvolvimento, permite passar sem validação
  }

  if (!token) {
    logger.warn("reCAPTCHA token is empty");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.RECAPTCHA_SECRET_KEY);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status },
        "Failed to verify reCAPTCHA token"
      );
      return false;
    }

    const data = (await response.json()) as RecaptchaResponse;

    if (!data.success) {
      logger.warn(
        { errorCodes: data["error-codes"] },
        "reCAPTCHA verification failed"
      );
      return false;
    }

    // Verificar score (apenas para v3)
    if (data.score !== undefined && data.score < MIN_SCORE) {
      logger.warn(
        { score: data.score, minScore: MIN_SCORE },
        "reCAPTCHA score too low"
      );
      return false;
    }

    logger.debug(
      { score: data.score, hostname: data.hostname },
      "reCAPTCHA verified successfully"
    );

    return true;
  } catch (error) {
    logger.error({ error }, "Error verifying reCAPTCHA token");
    return false;
  }
}

