import { randomUUID } from "crypto";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { KycStatus } from "../../../domain/entities/KycStatus";
import { PixKeyStatus } from "../../../domain/entities/PixKeyStatus";
import { LedgerEntryStatus, LedgerEntryType } from "../../../domain/entities/LedgerEntryType";
import { calculateBalance } from "../../../domain/services/BalanceCalculator";
import { UserLedgerRepositoryPort } from "../../../ports/UserLedgerRepositoryPort";
import { UserPixKeyRepositoryPort } from "../../../ports/UserPixKeyRepositoryPort";
import { WithdrawalRepositoryPort } from "../../../ports/WithdrawalRepositoryPort";
import { WithdrawalStatus } from "../../../domain/entities/WithdrawalStatus";

interface RequestWithdrawalInput {
  userId: string;
  amountCents: number;
  idempotencyKey: string;
}

export class RequestWithdrawalUseCase {
  private readonly WITHDRAWAL_FEE_CENTS = 150;

  constructor(
    private readonly ledgerRepository: UserLedgerRepositoryPort,
    private readonly pixKeyRepository: UserPixKeyRepositoryPort,
    private readonly withdrawalRepository: WithdrawalRepositoryPort
  ) {}

  async execute(input: RequestWithdrawalInput) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const userAny = user as any;
    if (String(userAny.kycStatus ?? KycStatus.UNVERIFIED) !== KycStatus.APPROVED) {
      throw new Error("KYC not approved");
    }

    if (input.amountCents <= 0) {
      throw new Error("Withdrawal amount must be positive");
    }

    const pixKey = await this.pixKeyRepository.findByUserId(input.userId);
    if (!pixKey || pixKey.status !== PixKeyStatus.VERIFIED) {
      throw new Error("Pix key not verified");
    }

    const existing = await this.withdrawalRepository.findByIdempotencyKey(
      input.userId,
      input.idempotencyKey
    );
    if (existing) {
      return existing;
    }

    const entries = await this.ledgerRepository.getEntriesForUser(input.userId);
    const balance = calculateBalance(entries);
    const totalDebited = input.amountCents + this.WITHDRAWAL_FEE_CENTS;

    if (totalDebited > balance.available) {
      throw new Error("Insufficient balance");
    }

    const withdrawalId = randomUUID();
    const createdWithdrawal = await this.withdrawalRepository.create({
      id: withdrawalId,
      userId: input.userId,
      amountCents: input.amountCents,
      feeCents: this.WITHDRAWAL_FEE_CENTS,
      totalDebitedCents: totalDebited,
      status: WithdrawalStatus.REQUESTED,
      idempotencyKey: input.idempotencyKey,
      version: 1,
    });

    await this.ledgerRepository.createMany([
      {
        userId: input.userId,
        type: LedgerEntryType.WITHDRAWAL_DEBIT,
        status: LedgerEntryStatus.PENDING,
        amountCents: input.amountCents,
        isCredit: false,
        referenceType: "WITHDRAWAL",
        referenceId: createdWithdrawal.id,
        occurredAt: new Date(),
      },
      {
        userId: input.userId,
        type: LedgerEntryType.WITHDRAWAL_FEE,
        status: LedgerEntryStatus.PENDING,
        amountCents: this.WITHDRAWAL_FEE_CENTS,
        isCredit: false,
        referenceType: "WITHDRAWAL",
        referenceId: createdWithdrawal.id,
        occurredAt: new Date(),
      },
    ]);

    await this.withdrawalRepository.update({
      ...createdWithdrawal,
      status: WithdrawalStatus.PENDING_PROCESSING,
    });

    return createdWithdrawal;
  }
}

