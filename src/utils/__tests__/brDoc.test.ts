import { onlyDigits, validateCpf, validateCnpj } from "../../utils/brDoc";

describe("Utils - BR Document", () => {
  it("onlyDigits removes non-numeric characters", () => {
    expect(onlyDigits("12.345-67")).toBe("1234567");
    expect(onlyDigits("abc123xyz")).toBe("123");
  });

  it("validateCpf returns true for a known valid CPF and false otherwise", () => {
    // Valid CPF example: 529.982.247-25
    expect(validateCpf("529.982.247-25")).toBe(true);
    expect(validateCpf("111.111.111-11")).toBe(false); // repeated digits
    expect(validateCpf("123.456.789-00")).toBe(false); // invalid check digits
    expect(validateCpf("short" as any)).toBe(false);
  });

  it("validateCnpj returns true for a known valid CNPJ and false otherwise", () => {
    // Valid CNPJ example: 04.252.011/0001-10 (Nubank)
    expect(validateCnpj("04.252.011/0001-10")).toBe(true);
    expect(validateCnpj("11.111.111/1111-11")).toBe(false); // repeated digits
    expect(validateCnpj("12.345.678/9012-34")).toBe(false); // invalid check digits
    expect(validateCnpj("short" as any)).toBe(false);
  });
});