import { ChargeSplit } from "../ChargeSplit";

describe("Domain - ChargeSplit", () => {
  const chargeId = "c-123";
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("computes fixed amount and validates against total", () => {
    const split = new ChargeSplit({ chargeId, merchantId, amountCents: 300 });
    expect(split.amountCents).toBe(300);
    expect(split.computeAmountForTotal(1000)).toBe(300);
    expect(() => split.computeAmountForTotal(200)).toThrow(/exceder o valor total/i);
  });

  it("computes percentage-based amount with floor rounding", () => {
    const split = new ChargeSplit({ chargeId, merchantId, percentage: 25 });
    expect(split.percentage).toBe(25);
    expect(split.computeAmountForTotal(1000)).toBe(250);
  });

  it("throws for invalid constructor inputs", () => {
    expect(() => new ChargeSplit({ chargeId, merchantId })).toThrow(/requer amountCents ou percentage/i);
    expect(() => new ChargeSplit({ chargeId, merchantId, amountCents: 0 })).toThrow(/maior que zero/i);
    expect(() => new ChargeSplit({ chargeId, merchantId, percentage: 0 })).toThrow(/entre 0 \(exclusivo\)/i);
    expect(() => new ChargeSplit({ chargeId, merchantId, percentage: 101 })).toThrow(/entre 0 \(exclusivo\)/i);
    const s = new ChargeSplit({ chargeId, merchantId, percentage: 10 });
    expect(() => s.computeAmountForTotal(0)).toThrow(/inválido para cálculo/i);
  });
});