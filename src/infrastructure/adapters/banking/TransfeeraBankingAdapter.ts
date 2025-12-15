import { PrismaClient } from "@prisma/client";
import { BankingPort, SettlementRequest, SettlementResponse } from "../../../ports/BankingPort";
import { TransfeeraClient } from "../payment/TransfeeraClient";
import { logger } from "../../logger";
import { prisma } from "../../database/prismaClient";

type TransferStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export class TransfeeraBankingAdapter implements BankingPort {
  constructor(
    private readonly client: TransfeeraClient = new TransfeeraClient(),
    private readonly prismaClient: PrismaClient = prisma
  ) {}

  async processSettlement(request: SettlementRequest): Promise<SettlementResponse> {
    const bankAccount = await this.prismaClient.bankAccount.findUnique({
      where: { id: request.bankAccountId },
    });

    if (!bankAccount) {
      throw new Error(`Bank account ${request.bankAccountId} not found`);
    }

    const accountType = (bankAccount.accountType ?? "CONTA_CORRENTE").toUpperCase();
    const integrationId = request.settlementId ?? request.merchantId;
    const idempotencyKey = request.settlementId ?? request.bankAccountId;

    // Validação básica via Conta Certa (falha rápida em caso de dados incorretos)
    const validation = await this.client.createValidation("BASICA", {
      name: bankAccount.bankName ?? "Recebedor",
      cpf_cnpj: bankAccount.document,
      bank_code: bankAccount.bankCode,
      agency: bankAccount.branchNumber,
      agency_digit: bankAccount.branchDigit ?? "",
      account: bankAccount.accountNumber,
      account_digit: bankAccount.accountDigit,
      account_type: accountType,
      integration_id: integrationId,
    });

    if (!validation.valid) {
      const firstError = validation.errors[0]?.message ?? "Dados bancários inválidos";
      throw new Error(`Bank validation failed: ${firstError}`);
    }

    // Cria lote e transferência
    const batch = await this.client.createBatch({
      type: "TRANSFERENCIA",
      autoClose: true,
      name: `settlement-${integrationId}`,
    });

    const transfer = await this.client.createTransfer(batch.id, {
      value: request.amountCents / 100,
      integration_id: integrationId,
      idempotency_key: idempotencyKey,
      pix_description: request.description,
      destination_bank_account: {
        name: bankAccount.bankName ?? "Recebedor",
        cpf_cnpj: bankAccount.document,
        bank_code: bankAccount.bankCode,
        agency: bankAccount.branchNumber,
        account: bankAccount.accountNumber,
        account_digit: bankAccount.accountDigit,
        account_type: accountType,
      },
    });

    // Melhor esforço para fechar lote (autoClose já foi definido)
    try {
      await this.client.closeBatch(batch.id);
    } catch (error) {
      logger.warn({ error }, "Failed to close Transfeera batch automatically");
    }

    const mappedStatus = this.mapTransferStatus(transfer.status);

    return {
      transactionId: transfer.id,
      status: mappedStatus,
      processedAt: mappedStatus === "COMPLETED" ? new Date() : undefined,
      failureReason: mappedStatus === "FAILED" ? transfer.error?.message : undefined,
    };
  }

  async getSettlementStatus(transactionId: string): Promise<SettlementResponse> {
    const transfer = await this.client.getTransfer(transactionId);
    const mappedStatus = this.mapTransferStatus(transfer.status);

    return {
      transactionId,
      status: mappedStatus,
      processedAt: mappedStatus === "COMPLETED" ? new Date() : undefined,
      failureReason: mappedStatus === "FAILED" ? transfer.error?.message : undefined,
    };
  }

  private mapTransferStatus(status: string): TransferStatus {
    const normalized = status.toUpperCase();
    if (normalized === "FINALIZADO" || normalized === "TRANSFERIDO") {
      return "COMPLETED";
    }
    if (normalized === "DEVOLVIDO" || normalized === "FALHA" || normalized === "FALHOU") {
      return "FAILED";
    }
    return "PROCESSING";
  }
}

