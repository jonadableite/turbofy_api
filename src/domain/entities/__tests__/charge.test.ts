import { Charge, ChargeStatus, ChargeMethod } from "../Charge";

describe("Domain - Charge", () => {
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("initializes with defaults and allows status/method changes", () => {
    const charge = new Charge({ merchantId, amountCents: 5000, idempotencyKey: "idem-1" });
    expect(charge.currency).toBe("BRL");
    expect(charge.status).toBe(ChargeStatus.PENDING);
    expect(charge.method).toBeUndefined();

    charge.setPaymentMethod(ChargeMethod.PIX);
    expect(charge.method).toBe(ChargeMethod.PIX);

    charge.markAsPaid();
    expect(charge.status).toBe(ChargeStatus.PAID);

    charge.markAsExpired();
    expect(charge.status).toBe(ChargeStatus.EXPIRED);

    charge.cancel();
    expect(charge.status).toBe(ChargeStatus.CANCELED);
  });

  it("produces immutable copies with Pix and Boleto data", () => {
    const charge = new Charge({ merchantId, amountCents: 3500, idempotencyKey: "idem-2", description: "Teste" });
    const withPix = charge.withPixData("qr-123", "copy-123");
    expect(withPix.id).toBe(charge.id);
    expect(withPix.pixQrCode).toBe("qr-123");
    expect(withPix.pixCopyPaste).toBe("copy-123");
    expect(withPix.updatedAt.getTime()).toBeGreaterThanOrEqual(charge.updatedAt.getTime());

    const withBoleto = withPix.withBoletoData("https://boleto.url/abc");
    expect(withBoleto.id).toBe(charge.id);
    expect(withBoleto.boletoUrl).toMatch(/https:\/\/boleto\.url\/abc/);
    expect(withBoleto.updatedAt.getTime()).toBeGreaterThanOrEqual(withPix.updatedAt.getTime());
  });
});