import {
    ChargeMethodSchema,
    CreateChargeRequestSchema,
} from "../charges";

describe("Schemas - charges", () => {
  it("defaults currency to BRL when omitted", () => {
    const parsed = CreateChargeRequestSchema.parse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 5000,
      idempotencyKey: "idem-0001",
    });
    expect(parsed.currency).toBe("BRL");
  });

  it("rejects unsupported currency when provided", () => {
    const result = CreateChargeRequestSchema.safeParse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 5000,
      currency: "USD",
      idempotencyKey: "idem-0002",
    } as any);
    expect(result.success).toBe(false);
  });

  it("allows method to be undefined (optional)", () => {
    const parsed = CreateChargeRequestSchema.parse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 5000,
      idempotencyKey: "idem-key-0003",
    });
    expect(parsed.method).toBeUndefined();
    // Ensure method enum accepts PIX/BOLETO
    expect(ChargeMethodSchema.safeParse("PIX").success).toBe(true);
    expect(ChargeMethodSchema.safeParse("BOLETO").success).toBe(true);
  });

  it("validates splits refine rule (amountCents or percentage required)", () => {
    const result = CreateChargeRequestSchema.safeParse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 5000,
      idempotencyKey: "idem-4",
      splits: [{ merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55" } as any],
    });
    expect(result.success).toBe(false);
  });

  it("rejects amountCents below minimum of R$ 5,00 (500 cents)", () => {
    const result = CreateChargeRequestSchema.safeParse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 499,
      idempotencyKey: "idem-min-001",
    });
    expect(result.success).toBe(false);
    // Verifica que o erro está relacionado a amountCents
    if (!result.success) {
      const errorIssues = result.error.issues || [];
      const hasAmountCentsError = errorIssues.some(
        (issue: any) => issue.path?.includes("amountCents") || issue.path?.[0] === "amountCents"
      );
      expect(hasAmountCentsError).toBe(true);
    }
  });

  it("accepts amountCents at minimum of R$ 5,00 (500 cents)", () => {
    const parsed = CreateChargeRequestSchema.parse({
      merchantId: "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55",
      amountCents: 500,
      idempotencyKey: "idem-min-002",
    });
    expect(parsed.amountCents).toBe(500);
  });
});