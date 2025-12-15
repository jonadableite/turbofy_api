import { generateCsrfToken, validateCsrfToken, revokeCsrfToken } from "../../security/csrf";

describe("Security - CSRF", () => {
  it("generates a token and validates it successfully", () => {
    const token = generateCsrfToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThanOrEqual(64); // 32 bytes hex
    expect(validateCsrfToken(token)).toBe(true);
  });

  it("returns false for empty or unknown token", () => {
    expect(validateCsrfToken("" as any)).toBe(false);
    expect(validateCsrfToken("non-existent-token")).toBe(false);
  });

  it("revokes token and then validation fails", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
    revokeCsrfToken(token);
    expect(validateCsrfToken(token)).toBe(false);
  });
});