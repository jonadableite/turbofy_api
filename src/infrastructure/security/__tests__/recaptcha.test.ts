import { jest } from '@jest/globals';

// Mock do env exatamente como importado em recaptcha.ts
jest.mock("../../../config/env", () => ({
  env: { RECAPTCHA_SECRET_KEY: undefined },
}));

// Import depois do mock
import { verifyRecaptcha } from "../recaptcha";

describe("recaptcha.verifyRecaptcha", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch as any;
  });

  it("retorna true quando RECAPTCHA_SECRET_KEY não está configurada", async () => {
    const ok = await verifyRecaptcha("token-any", "127.0.0.1");
    expect(ok).toBe(true);
  });

  it("retorna false quando token está vazio e secret configurada", async () => {
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret" } }));
      const { verifyRecaptcha: verify } = require("../recaptcha");
      return (async () => {
        const ok = await verify("");
        expect(ok).toBe(false);
      })();
    });
  });

  it("retorna true quando Google responde sucesso com score suficiente", async () => {
    jest.resetModules();
    jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret" } }));
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, score: 0.9 }),
      status: 200,
    })) as any;

    const { verifyRecaptcha: verify } = require("../recaptcha");
    const ok = await verify("valid-token", "127.0.0.1");
    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("retorna false quando status HTTP não é ok", async () => {
    jest.resetModules();
    jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret" } }));
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as any;

    const { verifyRecaptcha: verify } = require("../recaptcha");
    const ok = await verify("token", "127.0.0.1");
    expect(ok).toBe(false);
  });

  it("retorna false quando success é false", async () => {
    jest.resetModules();
    jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret" } }));
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, ["error-codes"]: ["bad-request"] }),
      status: 200,
    })) as any;

    const { verifyRecaptcha: verify } = require("../recaptcha");
    const ok = await verify("token", "127.0.0.1");
    expect(ok).toBe(false);
  });

  it("retorna false quando score é abaixo do mínimo", async () => {
    jest.resetModules();
    jest.doMock("../../../config/env", () => ({ env: { RECAPTCHA_SECRET_KEY: "secret" } }));
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, score: 0.3 }),
      status: 200,
    })) as any;

    const { verifyRecaptcha: verify } = require("../recaptcha");
    const ok = await verify("token", "127.0.0.1");
    expect(ok).toBe(false);
  });
});