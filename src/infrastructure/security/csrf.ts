/**
 * Serviço para geração e validação de tokens CSRF
 */

import crypto from "crypto";
import { logger } from "../logger";

// Armazenamento em memória (em produção, usar Redis ou sessão)
const csrfTokens = new Map<string, { token: string; expiresAt: Date }>();

const CSRF_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora

/**
 * Gera um novo token CSRF
 * @returns Token CSRF
 */
export function generateCsrfToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CSRF_TOKEN_EXPIRY_MS);

  // Limpar tokens expirados periodicamente
  cleanupExpiredTokens();

  // Armazenar token
  csrfTokens.set(token, { token, expiresAt });

  logger.debug({ token: token.substring(0, 8) + "..." }, "CSRF token generated");

  return token;
}

/**
 * Valida um token CSRF
 * @param token Token a ser validado
 * @returns true se válido, false caso contrário
 */
export function validateCsrfToken(token: string): boolean {
  if (!token) {
    return false;
  }

  const stored = csrfTokens.get(token);

  if (!stored) {
    logger.warn("CSRF token not found");
    return false;
  }

  if (stored.expiresAt < new Date()) {
    logger.warn("CSRF token expired");
    csrfTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Remove tokens CSRF expirados
 */
function cleanupExpiredTokens(): void {
  const now = new Date();
  for (const [token, data] of csrfTokens.entries()) {
    if (data.expiresAt < now) {
      csrfTokens.delete(token);
    }
  }
}

/**
 * Remove um token CSRF (útil após uso)
 * @param token Token a ser removido
 */
export function revokeCsrfToken(token: string): void {
  csrfTokens.delete(token);
}

