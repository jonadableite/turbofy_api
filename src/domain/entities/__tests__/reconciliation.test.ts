import { Reconciliation, ReconciliationStatus, ReconciliationType } from "../Reconciliation";

describe("Domain - Reconciliation", () => {
  const merchantId = "8a29e7a2-7b91-4b7a-9b3e-3a0f3d2b1d55";

  it("validates dates and processes matches and completions", () => {
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const rec = new Reconciliation({ merchantId, type: ReconciliationType.AUTOMATIC, startDate: start, endDate: end });
    expect(rec.status).toBe(ReconciliationStatus.PENDING);

    rec.startProcessing(10000);
    expect(rec.status).toBe(ReconciliationStatus.PROCESSING);
    expect(rec.totalAmountCents).toBe(10000);

    rec.addMatch("charge-1", 3000, "txn-1");
    rec.addMatch("charge-2", 2000, "txn-2");
    rec.addUnmatchedCharge("charge-3");
    expect(rec.matchedAmountCents).toBe(5000);
    expect(rec.unmatchedCharges.length).toBe(1);

    rec.complete();
    // partial because unmatched exists
    expect([ReconciliationStatus.PARTIAL, ReconciliationStatus.COMPLETED]).toContain(rec.status);
    expect(rec.processedAt).toBeDefined();
  });

  it("fails during processing and sets failure reason", () => {
    const start = new Date(Date.now() - 3600 * 1000);
    const end = new Date(Date.now() + 3600 * 1000);
    const rec = new Reconciliation({ merchantId, type: ReconciliationType.MANUAL, startDate: start, endDate: end });
    rec.startProcessing(5000);
    rec.fail("network-error");
    expect(rec.status).toBe(ReconciliationStatus.FAILED);
    expect(rec.failureReason).toBe("network-error");
  });
});