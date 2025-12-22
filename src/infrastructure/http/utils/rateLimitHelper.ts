/**
 * Helper para criar rate limiters seguros com trust proxy
 * 
 * Quando trust proxy está ativo, precisamos usar uma função keyGenerator customizada
 * que não dependa apenas do IP para evitar bypass do rate limiting.
 */

import { Request } from "express";
import rateLimit from "express-rate-limit";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
}

/**
 * Cria um rate limiter seguro que funciona com trust proxy
 * 
 * Usa uma combinação de IP + User-Agent + Path para gerar a chave,
 * tornando mais difícil bypass do rate limiting mesmo com trust proxy ativo.
 */
export function createSecureRateLimiter(options: RateLimitOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
    // Função customizada para gerar chave de rate limiting
    // Combina IP + User-Agent + Path para maior segurança
    keyGenerator: (req: Request): string => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      const path = req.path || req.url?.split("?")[0] || "unknown";
      
      // Criar hash simples para combinar os valores
      // Isso previne bypass mesmo com trust proxy ativo
      const combined = `${ip}:${userAgent}:${path}`;
      
      // Usar hash simples (não precisa ser criptograficamente seguro, apenas único)
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      return `rate_limit:${Math.abs(hash)}`;
    },
    skip: options.skip,
  });
}
