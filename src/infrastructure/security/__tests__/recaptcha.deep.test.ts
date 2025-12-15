describe("Security - reCAPTCHA deep scenarios", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  function mockEnvWithSecret() {
    jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret-key" } }));
  }

  it("returns false when HTTP response is not ok", async () => {
    mockEnvWithSecret();
    // Mock fetch to simulate non-OK response
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({ ok: false, status: 500 });
    const { verifyRecaptcha } = await import("../../security/recaptcha");
    const ok = await verifyRecaptcha("token-1", "127.0.0.1");
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns false when API success=false with error codes", async () => {
    mockEnvWithSecret();
    const json = async () => ({ success: false, ["error-codes"]: ["invalid-input-response"] });
    const fetchMock = jest.spyOn(global, "fetch" as any).mockResolvedValue({ ok: true, json });
    const { verifyRecaptcha } = await import("../../security/recaptcha");
    const ok = await verifyRecaptcha("token-2");
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns false when score is below minimum", async () => {
    mockEnvWithSecret();
    const json = async () => ({ success: true, score: 0.3 });
    jest.spyOn(global, "fetch" as any).mockResolvedValue({ ok: true, json });
    const { verifyRecaptcha } = await import("../../security/recaptcha");
    const ok = await verifyRecaptcha("token-3");
    expect(ok).toBe(false);
  });

  it("returns true when success=true and score is high", async () => {
    mockEnvWithSecret();
    const json = async () => ({ success: true, score: 0.9, hostname: "turbofy.local" });
    jest.spyOn(global, "fetch" as any).mockResolvedValue({ ok: true, json });
    const { verifyRecaptcha } = await import("../../security/recaptcha");
    const ok = await verifyRecaptcha("token-4", "127.0.0.1");
    expect(ok).toBe(true);
  });
});