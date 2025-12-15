import { OnboardingService } from "../OnboardingService";
import { prisma } from "../../../infrastructure/database/prismaClient";

// Mock prisma
jest.mock("../../../infrastructure/database/prismaClient", () => ({
  prisma: {
    merchantProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
    merchantDocument: {
      findMany: jest.fn(),
    },
    course: {
      count: jest.fn(),
    },
    raffle: {
      count: jest.fn(),
    },
  },
}));

describe("OnboardingService (Unit)", () => {
  const service = new OnboardingService();
  const merchantId = "test-merchant-id";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 0% progress when profile is empty", async () => {
    (prisma.merchantProfile.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({ type: "PRODUCER" });
    (prisma.merchantDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.course.count as jest.Mock).mockResolvedValue(0);
    (prisma.raffle.count as jest.Mock).mockResolvedValue(0);

    const status = await service.getStatus(merchantId);

    expect(status.progress?.percent).toBe(0);
    expect(status.isComplete).toBe(false);
    expect(status.progress?.stages.find((s) => s.key === "personalData")?.complete).toBe(false);
    expect(status.documents).toHaveLength(0);
  });

  it("returns correct progress when personal data is filled", async () => {
    (prisma.merchantProfile.findUnique as jest.Mock).mockResolvedValue({
      merchantId,
      fullName: "John Doe",
      document: "12345678900",
      phone: "1234567890",
      onboardingStep: 1,
    });
    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({ type: "PRODUCER" });
    (prisma.merchantDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.course.count as jest.Mock).mockResolvedValue(0);

    const status = await service.getStatus(merchantId);

    // Total 5 stages for PRODUCER (personal, address, docs, compliance, goLive)
    // 1 complete (personal) => 1/5 = 20%
    expect(status.progress?.percent).toBe(20);
    expect(status.progress?.stages.find((s) => s.key === "personalData")?.complete).toBe(true);
    expect(status.progress?.stages.find((s) => s.key === "address")?.complete).toBe(false);
    expect(status.documents).toHaveLength(0);
  });

  it("calculates 100% only when everything is done (PRODUCER)", async () => {
    (prisma.merchantProfile.findUnique as jest.Mock).mockResolvedValue({
      merchantId,
      fullName: "John Doe",
      document: "12345678900",
      phone: "1234567890",
      zipCode: "12345678",
      street: "Main St",
      number: "123",
      city: "City",
      state: "ST",
      approvalStatus: "APPROVED",
      onboardingStep: 4,
    });
    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({ type: "PRODUCER" });
    
    // Documents present (simulated by empty missing documents list logic in service)
    // The service calls getMissingDocumentTypes which calls summarizeDocuments
    // We need to mock findMany to return valid docs
    (prisma.merchantDocument.findMany as jest.Mock).mockResolvedValue([
      { type: "SELFIE" },
      { type: "RG_FRONT" },
      { type: "RG_BACK" },
    ]);

    (prisma.course.count as jest.Mock).mockResolvedValue(1); // Has course

    const status = await service.getStatus(merchantId);

    expect(status.progress?.percent).toBe(100);
    expect(status.isComplete).toBe(true);
    expect(status.progress?.stages.every((s) => s.complete)).toBe(true);
    expect(status.documents).toHaveLength(3);
  });

  it("calculates 100% for RIFEIRO even without raffle setup if configured as optional", async () => {
    // In the code, raffleSetup is required: false for RIFEIRO?
    // Let's check the code:
    // const goLiveStage = merchantType === "RIFEIRO" ? { key: "raffleSetup", required: false, ... }
    // So it should reach 100% if other required stages are done.

    (prisma.merchantProfile.findUnique as jest.Mock).mockResolvedValue({
      merchantId,
      fullName: "John Doe",
      document: "12345678900",
      phone: "1234567890",
      zipCode: "12345678",
      street: "Main St",
      number: "123",
      city: "City",
      state: "ST",
      approvalStatus: "APPROVED",
      onboardingStep: 4,
    });
    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({ type: "RIFEIRO" });
    
    (prisma.merchantDocument.findMany as jest.Mock).mockResolvedValue([
      { type: "SELFIE" },
      { type: "RG_FRONT" },
      { type: "RG_BACK" },
    ]);

    (prisma.raffle.count as jest.Mock).mockResolvedValue(0); // No raffle yet

    const status = await service.getStatus(merchantId);

    // 4 required stages (personal, address, docs, compliance)
    // raffleSetup is optional.
    // 4/4 = 100%
    expect(status.progress?.percent).toBe(100);
    expect(status.isComplete).toBe(true);
    expect(status.documents).toHaveLength(3);
  });
});

