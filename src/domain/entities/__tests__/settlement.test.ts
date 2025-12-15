import { Settlement, SettlementStatus } from "../Settlement";

describe("Domain - Settlement", () => {
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("schedules in the future and updates status", () => {
    const s = new Settlement({ merchantId, amountCents: 5000 });
    expect(s.status).toBe(SettlementStatus.PENDING);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    s.schedule(future, "bank-1");
    expect(s.status).toBe(SettlementStatus.SCHEDULED);
    expect(s.scheduledFor).toEqual(future);
    expect(s.canBeProcessed()).toBe(true);
    expect(s.isDue()).toBe(false);
  });

  it("throws when scheduling in the past", () => {
    const s = new Settlement({ merchantId, amountCents: 5000 });
    const past = new Date(Date.now() - 60 * 1000);
    expect(() => s.schedule(past, "bank-1")).toThrow(/future/i);
  });

  it("is due when pending and no schedule set", () => {
    const s = new Settlement({ merchantId, amountCents: 5000 });
    expect(s.isDue()).toBe(true);
  });
});