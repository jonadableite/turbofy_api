/**
 * SearchRifeiroByDocument Use Case
 * 
 * Busca um Rifeiro (Merchant do tipo RIFEIRO) pelo CPF/CNPJ
 * Usado por Producers para associar Rifeiros aos seus sites
 */

import { prisma } from "../../infrastructure/database/prismaClient";

export interface SearchRifeiroByDocumentInput {
  document: string;
}

export interface SearchRifeiroByDocumentOutput {
  found: boolean;
  rifeiro?: {
    id: string;
    name: string;
    email: string;
    document: string;
    type: "RIFEIRO";
    active: boolean;
  };
  user?: {
    id: string;
    email: string;
    document: string;
    phone?: string | null;
  };
}

const normalizeDocument = (value: string): string => value.replace(/\D/g, "");

export class SearchRifeiroByDocument {
  async execute(input: SearchRifeiroByDocumentInput): Promise<SearchRifeiroByDocumentOutput> {
    const document = normalizeDocument(input.document);

    if (!document || document.length < 11) {
      return { found: false };
    }

    // Buscar User pelo documento
    const user = await prisma.user.findUnique({
      where: { document },
      select: {
        id: true,
        email: true,
        document: true,
        phone: true,
        merchant: {
          select: {
            id: true,
            name: true,
            email: true,
            document: true,
            type: true,
            active: true,
          },
        },
      },
    });

    // Verificar se o User tem um Merchant do tipo RIFEIRO
    if (user?.merchant && user.merchant.type === "RIFEIRO") {
      return {
        found: true,
        rifeiro: {
          id: user.merchant.id,
          name: user.merchant.name,
          email: user.merchant.email,
          document: user.merchant.document,
          type: "RIFEIRO",
          active: user.merchant.active,
        },
        user: {
          id: user.id,
          email: user.email,
          document: user.document,
          phone: user.phone,
        },
      };
    }

    // Se não for RIFEIRO, ainda retornar dados do usuário para permitir criação manual
    if (user) {
      return {
        found: false,
        user: {
          id: user.id,
          email: user.email,
          document: user.document,
          phone: user.phone,
        },
      };
    }

    return { found: false };
  }
}

