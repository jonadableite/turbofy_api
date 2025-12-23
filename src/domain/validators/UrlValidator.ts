/**
 * Validador de URLs com proteção anti-SSRF
 * 
 * Bloqueia URLs que apontam para recursos internos, prevenindo ataques SSRF
 * (Server-Side Request Forgery)
 * 
 * @security Bloqueia localhost, IPs privados, link-local e resolve DNS antes de aceitar
 * @maintainability Validações centralizadas e reutilizáveis
 */

import { URL } from "url";
import dns from "dns/promises";

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

/**
 * Validador de URLs com proteção anti-SSRF
 */
export class UrlValidator {
  // Redes privadas IPv4 (RFC 1918)
  private static readonly PRIVATE_IPV4_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" }, // 10.0.0.0/8
    { start: "172.16.0.0", end: "172.31.255.255" }, // 172.16.0.0/12
    { start: "192.168.0.0", end: "192.168.255.255" }, // 192.168.0.0/16
  ];

  // Link-local range (RFC 3927)
  private static readonly LINK_LOCAL_RANGE = {
    start: "169.254.0.0",
    end: "169.254.255.255",
  };

  // Localhost e IPs bloqueados
  private static readonly BLOCKED_IPS = [
    "127.0.0.1",
    "127.0.0.0",
    "0.0.0.0",
    "::1", // localhost IPv6
    "::", // any IPv6
  ];

  private static readonly BLOCKED_HOSTS = [
    "localhost",
    "local",
    "127.0.0.1",
    "0.0.0.0",
  ];

  /**
   * Valida uma URL para uso em webhook
   * 
   * @param url - URL a ser validada
   * @param devMode - Se true, permite HTTP (apenas para desenvolvimento)
   * @throws {UrlValidationError} Se a URL for inválida ou insegura
   */
  static async validate(url: string, devMode: boolean = false): Promise<void> {
    // 1. Validar formato da URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      throw new UrlValidationError("URL inválida: formato incorreto");
    }

    // 2. Validar protocolo
    if (!devMode && parsedUrl.protocol !== "https:") {
      throw new UrlValidationError(
        "URL deve usar HTTPS em produção. Use devMode para permitir HTTP em desenvolvimento."
      );
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new UrlValidationError(
        `Protocolo inválido: ${parsedUrl.protocol}. Apenas HTTP(S) são permitidos.`
      );
    }

    // 3. Validar hostname
    const hostname = parsedUrl.hostname.toLowerCase();

    // Bloquear hosts conhecidos
    if (this.BLOCKED_HOSTS.some((blocked) => hostname.includes(blocked))) {
      throw new UrlValidationError(
        `Hostname bloqueado: ${hostname}. Não é permitido usar localhost ou IPs internos.`
      );
    }

    // 4. Resolver DNS e validar IP
    try {
      const addresses = await dns.resolve4(parsedUrl.hostname);

      if (addresses.length === 0) {
        throw new UrlValidationError(
          `Não foi possível resolver DNS para: ${parsedUrl.hostname}`
        );
      }

      // Validar cada IP resolvido
      for (const ip of addresses) {
        this.validateIp(ip);
      }
    } catch (err) {
      if (err instanceof UrlValidationError) {
        throw err;
      }

      // Se não conseguir resolver, pode ser um hostname inválido ou problema temporário
      // Em produção, é mais seguro bloquear
      throw new UrlValidationError(
        `Erro ao resolver DNS para: ${parsedUrl.hostname}. ${
          err instanceof Error ? err.message : "Erro desconhecido"
        }`
      );
    }
  }

  /**
   * Valida um endereço IP
   * 
   * @param ip - Endereço IPv4
   * @throws {UrlValidationError} Se o IP for privado, localhost ou link-local
   */
  private static validateIp(ip: string): void {
    // Bloquear IPs específicos
    if (this.BLOCKED_IPS.includes(ip)) {
      throw new UrlValidationError(
        `IP bloqueado: ${ip}. Não é permitido usar localhost ou IPs reservados.`
      );
    }

    // Bloquear redes privadas
    if (this.isPrivateIp(ip)) {
      throw new UrlValidationError(
        `IP privado bloqueado: ${ip}. Não é permitido usar IPs de redes privadas (RFC 1918).`
      );
    }

    // Bloquear link-local
    if (this.isLinkLocalIp(ip)) {
      throw new UrlValidationError(
        `IP link-local bloqueado: ${ip}. Não é permitido usar IPs link-local (RFC 3927).`
      );
    }
  }

  /**
   * Verifica se um IP está em uma rede privada (RFC 1918)
   */
  private static isPrivateIp(ip: string): boolean {
    const ipNum = this.ipToNumber(ip);

    for (const range of this.PRIVATE_IPV4_RANGES) {
      const startNum = this.ipToNumber(range.start);
      const endNum = this.ipToNumber(range.end);

      if (ipNum >= startNum && ipNum <= endNum) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verifica se um IP está na faixa link-local (RFC 3927)
   */
  private static isLinkLocalIp(ip: string): boolean {
    const ipNum = this.ipToNumber(ip);
    const startNum = this.ipToNumber(this.LINK_LOCAL_RANGE.start);
    const endNum = this.ipToNumber(this.LINK_LOCAL_RANGE.end);

    return ipNum >= startNum && ipNum <= endNum;
  }

  /**
   * Converte um IP (string) para número para comparação
   * 
   * Exemplo: "192.168.1.1" -> 3232235777
   */
  private static ipToNumber(ip: string): number {
    const parts = ip.split(".").map((part) => parseInt(part, 10));

    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      throw new UrlValidationError(`IP inválido: ${ip}`);
    }

    return (
      (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
    ) >>> 0; // >>> 0 garante unsigned
  }
}
