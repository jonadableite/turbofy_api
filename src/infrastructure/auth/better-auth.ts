/**
 * Better Auth Configuration
 * 
 * @security Integração segura com Prisma adapter para PostgreSQL
 * @performance Usa bcrypt para compatibilidade com senhas existentes
 * @maintainability Campos adicionais do usuário preservados do schema existente
 */

import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { env } from "../../config/env";
import { prisma } from "../database/prismaClient";

// Separar as trusted origins por vírgula se for uma string
const getTrustedOrigins = (): string[] => {
  const frontendUrl = env.FRONTEND_URL;
  const origins: string[] = [
    frontendUrl,
    "http://localhost:3131",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  
  // Adicionar domínios de produção
  if (env.NODE_ENV === "production") {
    origins.push(
      "https://turbofypay.com",
      "https://app.turbofypay.com",
      "https://api.turbofypay.com"
    );
  }
  
  return origins.filter(Boolean);
};

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustedOrigins: getTrustedOrigins(),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Usar bcrypt para compatibilidade com senhas existentes
    password: {
      hash: async (password: string): Promise<string> => {
        return bcrypt.hash(password, 12);
      },
      verify: async ({ hash, password }: { hash: string; password: string }): Promise<boolean> => {
        return bcrypt.compare(password, hash);
      },
    },
  },

  user: {
    // Mapear para o modelo user existente
    modelName: "user",
    additionalFields: {
      // Campos customizados do User existente no schema Turbofy
      // NOTA: role (singular) é gerenciado pelo Admin plugin e suporta múltiplos valores
      // separados por vírgula (ex: "OWNER,ADMIN")
      document: {
        type: "string",
        required: true,
      },
      documentType: {
        type: "string",
        required: false,
      },
      kycStatus: {
        type: "string",
        required: false,
        defaultValue: "UNVERIFIED",
        input: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      merchantId: {
        type: "string",
        required: false,
        input: false,
      },
      tenantId: {
        type: "string",
        required: false,
        input: false,
      },
      // Campo passwordHash para compatibilidade com migração de usuários existentes
      passwordHash: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  session: {
    modelName: "session",
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // Refresh a cada 24h
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache de 5 minutos
    },
  },

  account: {
    modelName: "account",
  },

  plugins: [
    admin({
      // IDs de usuários admin fixos (opcional, pode ser preenchido depois)
      adminUserIds: [],
      // Roles considerados admin
      adminRoles: ["ADMIN", "SUPER_ADMIN"],
      // Role padrão para novos usuários
      defaultRole: "BUYER",
    }),
  ],

  advanced: {
    crossSubDomainCookies: {
      enabled: env.NODE_ENV === "production",
      domain: ".turbofypay.com",
    },
    // Usar UUID gerado pelo Prisma
    database: {
      generateId: false,
    },
  },
});

// Tipos exportados para uso em outros arquivos
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
