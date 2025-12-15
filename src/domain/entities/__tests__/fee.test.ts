import { Fee } from "../Fee";

describe("Domain - Fee", () => {
  const chargeId = "c-123";

  it("validates constructor and applies to totals", () => {
    const fee = new Fee({ chargeId, type: "platform", amountCents: 300 });
    expect(fee.amountCents).toBe(300);
    expect(fee.applyToTotal(1000)).toBe(700);
    expect(fee.applyToTotal(200)).toBe(0); // cannot go negative
  });

  it("throws for invalid inputs", () => {
    expect(() => new Fee({ chargeId, type: "", amountCents: 100 })).toThrow(/obrigatório/i);
    expect(() => new Fee({ chargeId, type: "platform", amountCents: -1 })).toThrow(/inteiro e >= 0/i);
    expect(() => new Fee({ chargeId, type: "platform", amountCents: 1.5 as any })).toThrow(/inteiro e >= 0/i);
    const fee = new Fee({ chargeId, type: "platform", amountCents: 10 });
    expect(() => fee.applyToTotal(-1)).toThrow(/Total inválido/i);
  });
});