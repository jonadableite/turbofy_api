/**
 * Testes unitários: UrlValidator
 * 
 * Valida proteção anti-SSRF e bloqueio de URLs maliciosas
 */

import { describe, it, expect } from "@jest/globals";
import { UrlValidator, UrlValidationError } from "../UrlValidator";

describe("UrlValidator", () => {
  describe("validate - HTTPS enforcement", () => {
    it("should reject HTTP URLs in production mode", async () => {
      await expect(
        UrlValidator.validate("http://example.com/webhook", false)
      ).rejects.toThrow(UrlValidationError);

      await expect(
        UrlValidator.validate("http://example.com/webhook", false)
      ).rejects.toThrow(/HTTPS/);
    });

    it("should allow HTTP URLs in dev mode", async () => {
      // Este teste pode falhar se example.com resolver para IP privado
      // mas deve aceitar o protocolo HTTP
      try {
        await UrlValidator.validate("http://httpbin.org/webhook", true);
      } catch (err) {
        // Se falhar, deve ser por outro motivo (DNS), não por HTTP
        expect(err).toBeInstanceOf(UrlValidationError);
        expect((err as Error).message).not.toMatch(/HTTPS/);
      }
    });

    it("should accept HTTPS URLs", async () => {
      // httpbin.org é público e deve passar
      await expect(
        UrlValidator.validate("https://httpbin.org/webhook", false)
      ).resolves.not.toThrow();
    });
  });

  describe("validate - Blocked hosts", () => {
    it("should reject localhost", async () => {
      await expect(
        UrlValidator.validate("https://localhost/webhook", false)
      ).rejects.toThrow(UrlValidationError);

      await expect(
        UrlValidator.validate("https://localhost/webhook", false)
      ).rejects.toThrow(/bloqueado/);
    });

    it("should reject 127.0.0.1", async () => {
      await expect(
        UrlValidator.validate("https://127.0.0.1/webhook", false)
      ).rejects.toThrow(UrlValidationError);
    });

    it("should reject 0.0.0.0", async () => {
      await expect(
        UrlValidator.validate("https://0.0.0.0/webhook", false)
      ).rejects.toThrow(UrlValidationError);
    });
  });

  describe("validate - Private IP ranges (RFC 1918)", () => {
    it("should reject 10.0.0.0/8", async () => {
      // Estes testes vão falhar no DNS resolve, mas podemos testar diretamente o método
      // Por enquanto, vamos apenas verificar que IPs privados são bloqueados
      const privateIps = [
        "https://10.0.0.1/webhook",
        "https://10.10.10.10/webhook",
        "https://10.255.255.255/webhook",
      ];

      for (const url of privateIps) {
        await expect(UrlValidator.validate(url, false)).rejects.toThrow(
          UrlValidationError
        );
      }
    });

    it("should reject 172.16.0.0/12", async () => {
      const privateIps = [
        "https://172.16.0.1/webhook",
        "https://172.20.0.1/webhook",
        "https://172.31.255.255/webhook",
      ];

      for (const url of privateIps) {
        await expect(UrlValidator.validate(url, false)).rejects.toThrow(
          UrlValidationError
        );
      }
    });

    it("should reject 192.168.0.0/16", async () => {
      const privateIps = [
        "https://192.168.0.1/webhook",
        "https://192.168.1.1/webhook",
        "https://192.168.255.255/webhook",
      ];

      for (const url of privateIps) {
        await expect(UrlValidator.validate(url, false)).rejects.toThrow(
          UrlValidationError
        );
      }
    });
  });

  describe("validate - Link-local range (RFC 3927)", () => {
    it("should reject 169.254.0.0/16", async () => {
      const linkLocalIps = [
        "https://169.254.0.1/webhook",
        "https://169.254.169.254/webhook", // AWS metadata
        "https://169.254.255.255/webhook",
      ];

      for (const url of linkLocalIps) {
        await expect(UrlValidator.validate(url, false)).rejects.toThrow(
          UrlValidationError
        );
      }
    });
  });

  describe("validate - Invalid formats", () => {
    it("should reject invalid URL format", async () => {
      await expect(
        UrlValidator.validate("not-a-url", false)
      ).rejects.toThrow(UrlValidationError);

      await expect(
        UrlValidator.validate("not-a-url", false)
      ).rejects.toThrow(/formato incorreto/);
    });

    it("should reject non-HTTP(S) protocols", async () => {
      await expect(
        UrlValidator.validate("ftp://example.com/webhook", false)
      ).rejects.toThrow(UrlValidationError);

      await expect(
        UrlValidator.validate("file:///etc/passwd", false)
      ).rejects.toThrow(UrlValidationError);
    });
  });
});
