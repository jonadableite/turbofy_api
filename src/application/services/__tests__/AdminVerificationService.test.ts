import { AdminVerificationService } from "../AdminVerificationService";

const sendOnboardingStatusEmail = jest.fn();

jest.mock("../../../infrastructure/email/EmailService", () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendOnboardingStatusEmail,
  })),
}));

const createPrismaMock = () => ({
  merchantProfile: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  merchantDocument: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

const prismaMock = createPrismaMock();

jest.mock("../../../infrastructure/database/prismaClient", () => ({
  prisma: prismaMock,
}));

describe("AdminVerificationService", () => {
  const service = new AdminVerificationService();
  const merchantId = "merchant-123";

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(prismaMock.merchantProfile).forEach((fn) => fn.mockReset());
    Object.values(prismaMock.merchantDocument).forEach((fn) => fn.mockReset());
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        merchantProfile: prismaMock.merchantProfile,
        merchantDocument: prismaMock.merchantDocument,
      })
    );
  });

  it("approves merchant and notifies via email", async () => {
    prismaMock.merchantProfile.findUnique.mockResolvedValue({
      merchantId,
      approvalStatus: "PENDING_APPROVAL",
      merchant: {
        email: "owner@example.com",
        name: "Owner",
      },
    });
    prismaMock.merchantProfile.update.mockResolvedValue({
      merchantId,
      approvalStatus: "APPROVED",
    });
    prismaMock.merchantDocument.updateMany.mockResolvedValue({ count: 3 });

    const profile = await service.approveMerchant(merchantId, {
      reviewerId: "admin-1",
      notes: "Tudo certo",
    });

    expect(profile.approvalStatus).toBe("APPROVED");
    expect(prismaMock.merchantDocument.updateMany).toHaveBeenCalledWith({
      where: { merchantId },
      data: expect.objectContaining({
        status: "APPROVED",
        reviewedBy: "admin-1",
      }),
    });
    expect(sendOnboardingStatusEmail).toHaveBeenCalledWith(
      "owner@example.com",
      "APPROVED",
      undefined,
      "Owner"
    );
  });

  it("rejects merchant with justification", async () => {
    prismaMock.merchantProfile.findUnique.mockResolvedValue({
      merchantId,
      approvalStatus: "PENDING_APPROVAL",
      merchant: {
        email: "owner@example.com",
        name: "Owner",
      },
    });
    prismaMock.merchantProfile.update.mockResolvedValue({
      merchantId,
      approvalStatus: "REJECTED",
      approvalNotes: "Documento ilegível",
    });
    prismaMock.merchantDocument.updateMany.mockResolvedValue({ count: 3 });

    const profile = await service.rejectMerchant(merchantId, "Documento ilegível", {
      reviewerId: "admin-1",
    });

    expect(profile.approvalStatus).toBe("REJECTED");
    expect(prismaMock.merchantDocument.updateMany).toHaveBeenCalledWith({
      where: { merchantId },
      data: expect.objectContaining({
        status: "REJECTED",
        rejectionReason: "Documento ilegível",
        reviewedBy: "admin-1",
      }),
    });
    expect(sendOnboardingStatusEmail).toHaveBeenCalledWith(
      "owner@example.com",
      "REJECTED",
      "Documento ilegível",
      "Owner"
    );
  });

  it("lists pending verifications with documents", async () => {
    prismaMock.merchantProfile.findMany.mockResolvedValue([
      {
        merchantId,
        onboardingStep: 3,
        approvalStatus: "PENDING_APPROVAL",
        fullName: "Owner",
        document: "123",
        updatedAt: new Date(),
        merchant: {
          id: "merchant-123",
          name: "Owner",
          email: "owner@example.com",
          documents: [],
        },
      },
    ]);

    const result = await service.listPendingVerifications();

    expect(result).toHaveLength(1);
    expect(prismaMock.merchantProfile.findMany).toHaveBeenCalled();
  });
});


