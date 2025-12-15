import { Fee } from "../entities/Fee";

describe("Fee", () => {
  it("aplica taxa ao total", () => {
    const fee = new Fee({ chargeId: "c1", type: "PIX_GATEWAY", amountCents: 250 });
    expect(fee.applyToTotal(10000)).toBe(9750);
  });

  it("não permite amountCents negativo", () => {
    expect(() => new Fee({ chargeId: "c1", type: "PIX_GATEWAY", amountCents: -1 })).toThrow();
  });
});