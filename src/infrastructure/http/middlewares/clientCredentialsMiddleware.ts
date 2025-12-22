/**
 * Middleware para autenticação com Client Credentials (x-client-id / x-client-secret)
 * Utilizado para integradores server-to-server
 * 
 * @security Valida credenciais contra ProviderCredentials encriptadas
 * @scalability Busca em banco otimizada com índice em clientId
 */

import { Request, Response, NextFunction } from "express";
import { prisma } from "../../database/prismaClient";
import { decryptSecret } from "../../security/crypto";
import { logger } from "../../logger";

const PROVIDER_KEY = "RIFEIRO_PIX"; // Provider usado para client credentials

/**
 * Interface estendida do Request com merchantId injetado
 */
export interface ClientCredentialsRequest extends Request {
  merchantId?: string;
  clientId?: string;
}

/**
 * Resolve e valida credenciais do cliente
 * 
 * @param clientId - ID público do cliente
 * @param clientSecret - Secret do cliente
 * @returns ProviderCredentials ou null se inválido
 */
async function resolveCredentials(clientId: string, clientSecret: string) {
  const record = await prisma.providerCredentials.findFirst({
    where: { clientId, provider: PROVIDER_KEY },
  });

  if (!record) {
    return null;
  }

  try {
    const storedSecret = decryptSecret(record.clientSecret);
    if (storedSecret !== clientSecret) {
      return null;
    }
  } catch (err) {
    logger.error({ err }, "Falha ao descriptografar secret do integrador");
    return null;
  }

  return record;
}

/**
 * Middleware que valida Client Credentials via headers
 * 
 * Injeta `merchantId` e `clientId` no request para uso nos controllers
 */
export async function clientCredentialsMiddleware(
  req: ClientCredentialsRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientId = req.header("x-client-id");
    const clientSecret = req.header("x-client-secret");

    if (!clientId || !clientSecret) {
      res.status(401).json({
        error: {
          code: "CREDENTIALS_REQUIRED",
          message: "Headers x-client-id e x-client-secret são obrigatórios",
        },
      });
      return;
    }

    const credential = await resolveCredentials(clientId, clientSecret);
    if (!credential) {
      res.status(401).json({
        error: { code: "INVALID_CLIENT_CREDENTIALS", message: "Credenciais inválidas" },
      });
      return;
    }

    // Injetar merchantId e clientId no request para uso nos controllers
    req.merchantId = credential.merchantId;
    req.clientId = clientId;

    next();
  } catch (err) {
    logger.error({ err }, "Erro no middleware de client credentials");
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erro interno" },
    });
  }
}
