import { Charge, ChargeMethod, ChargeStatus } from "../entities/Charge";

describe("Charge", () => {
  it("inicia PENDING e permite marcar como PAID", () => {
    const charge = new Charge({
      merchantId: "m1",
      amountCents: 5000,
      idempotencyKey: "abc12345",
    });
    expect(charge.status).toBe(ChargeStatus.PENDING);
    charge.markAsPaid();
    expect(charge.status).toBe(ChargeStatus.PAID);
  });

  it("define método de pagamento", () => {
    const charge = new Charge({ merchantId: "m1", amountCents: 5000, idempotencyKey: "abc12345" });
    charge.setPaymentMethod(ChargeMethod.PIX);
    expect(charge.method).toBe(ChargeMethod.PIX);
  });
});