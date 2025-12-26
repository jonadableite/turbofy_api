/**
 * Better Auth Middleware
 * 
 * @security Verifica sessão do usuário via Better Auth API
 * @performance Usa cache de sessão quando disponível
 * @maintainability Compatível com o middleware anterior via req.user
 */

import { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session, type User } from "../../auth/better-auth";
import { makeLogger } from "../../logger";

const logger = makeLogger();

// Estender o tipo Request para incluir user e session do Better Auth
declare global {
  namespace Express {
    interface Request {
      user?: User & {
        kycStatus?: string;
        documentType?: string;
        role?: string; // Campo role do Better Auth (múltiplos roles separados por vírgula)
      };
      session?: Session;
    }
  }
}

/**
 * Middleware de autenticação usando Better Auth
 * 
 * Verifica se o usuário possui uma sessão válida e anexa os dados
 * do usuário e sessão ao objeto request para uso nas rotas.
 */
export const betterAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    // Obter sessão via Better Auth API
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      logger.warn({
        type: "AUTH_NO_SESSION",
        message: "Sessão não encontrada ou expirada",
        payload: { path: req.path, method: req.method },
      });
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Sessão não encontrada ou expirada" 
      });
    }

    // Anexar dados do usuário e sessão ao request
    // Mantém compatibilidade com código existente que espera req.user
    req.user = {
      ...session.user,
      // Campos adicionais para compatibilidade
      kycStatus: (session.user as Record<string, unknown>).kycStatus as string | undefined,
      documentType: (session.user as Record<string, unknown>).documentType as string | undefined,
      role: (session.user as Record<string, unknown>).role as string | undefined,
    };
    req.session = session as Session;

    logger.debug({
      type: "AUTH_SESSION_VALID",
      message: "Sessão válida",
      payload: { 
        userId: session.user.id, 
        path: req.path,
        role: (session.user as Record<string, unknown>).role, // roles como string separada por vírgula
      },
    });

    return next();
  } catch (error) {
    logger.error({
      type: "AUTH_ERROR",
      message: "Erro ao verificar sessão",
      error,
      payload: { path: req.path, method: req.method },
    });
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Erro ao verificar autenticação" 
    });
  }
};

/**
 * Middleware de autorização por role
 * 
 * Verifica se o usuário autenticado possui uma das roles especificadas.
 * Deve ser usado APÓS betterAuthMiddleware.
 * 
 * @param allowedRoles - Array de roles permitidos
 */
export const requireRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Usuário não autenticado" 
      });
    }

    const userRoles = (req.user as Record<string, unknown>).roles as string[] | undefined;
    
    if (!userRoles || !Array.isArray(userRoles)) {
      logger.warn({
        type: "AUTH_NO_ROLES",
        message: "Usuário sem roles definidos",
        payload: { userId: req.user.id },
      });
      return res.status(403).json({ 
        error: "Forbidden",
        message: "Usuário sem permissões definidas" 
      });
    }

    const hasAllowedRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasAllowedRole) {
      logger.warn({
        type: "AUTH_FORBIDDEN",
        message: "Acesso negado por falta de permissão",
        payload: { 
          userId: req.user.id, 
          userRoles, 
          requiredRoles: allowedRoles 
        },
      });
      return res.status(403).json({ 
        error: "Forbidden",
        message: "Você não tem permissão para acessar este recurso" 
      });
    }

    return next();
  };
};

/**
 * Middleware para verificar se o usuário é admin
 * Atalho para requireRoles(["ADMIN", "SUPER_ADMIN"])
 */
export const requireAdmin = requireRoles(["ADMIN", "SUPER_ADMIN"]);

/**
 * Middleware para verificar se o usuário é produtor/owner
 * Atalho para requireRoles(["OWNER", "PRODUCER", "ADMIN", "SUPER_ADMIN"])
 */
export const requireProducer = requireRoles(["OWNER", "PRODUCER", "ADMIN", "SUPER_ADMIN"]);

/**
 * Alias para compatibilidade com código existente
 */
export const ensureAuthenticated = betterAuthMiddleware;
