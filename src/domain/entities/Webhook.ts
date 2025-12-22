import { createHmac, randomBytes } from "crypto";

export type WebhookStatus = "ACTIVE" | "INACTIVE" | "FAILED";

export const WEBHOOK_EVENTS = [
  "billing.paid",
  "billing.created",
  "billing.expired",
  "billing.refunded",
  "withdraw.done",
  "withdraw.failed",
  "enrollment.created",
  "charge.created",
  "charge.paid",
  "charge.expired",
  "webhook.test", // Evento de teste para validar configuração de webhook
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookProps {
  id: string;
  publicId: string;
  merchantId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  status: WebhookStatus;
  failureCount: number;
  lastCalledAt: Date | null;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  lastError: string | null;
  devMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookInput {
  merchantId: string;
  name: string;
  url: string;
  events: string[];
  devMode?: boolean;
}

export interface CreateWebhookResult {
  webhook: Webhook;
  secret: string; // Secret em texto plano (mostrado apenas uma vez)
}

const WEBHOOK_ID_PREFIX = "wh_";
const SECRET_BYTES = 32;

export class Webhook {
  readonly id: string;
  readonly publicId: string;
  readonly merchantId: string;
  readonly name: string;
  readonly url: string;
  readonly secret: string;
  readonly events: string[];
  readonly status: WebhookStatus;
  readonly failureCount: number;
  readonly lastCalledAt: Date | null;
  readonly lastSuccess: Date | null;
  readonly lastFailure: Date | null;
  readonly lastError: string | null;
  readonly devMode: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: WebhookProps) {
    this.id = props.id;
    this.publicId = props.publicId;
    this.merchantId = props.merchantId;
    this.name = props.name;
    this.url = props.url;
    this.secret = props.secret;
    this.events = props.events;
    this.status = props.status;
    this.failureCount = props.failureCount;
    this.lastCalledAt = props.lastCalledAt;
    this.lastSuccess = props.lastSuccess;
    this.lastFailure = props.lastFailure;
    this.lastError = props.lastError;
    this.devMode = props.devMode;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateWebhookInput): CreateWebhookResult {
    // Gerar public ID único
    const publicIdBody = randomBytes(12).toString("hex");
    const publicId = `${WEBHOOK_ID_PREFIX}${publicIdBody}`;

    // Gerar secret
    const secret = randomBytes(SECRET_BYTES).toString("hex");

    // Validar URL (deve ser HTTPS em produção)
    if (!input.devMode && !input.url.startsWith("https://")) {
      throw new WebhookValidationError("URL deve usar HTTPS em produção");
    }

    // Validar eventos
    const invalidEvents = input.events.filter(
      (e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent)
    );
    if (invalidEvents.length > 0) {
      throw new WebhookValidationError(
        `Eventos inválidos: ${invalidEvents.join(", ")}`
      );
    }

    const now = new Date();
    const webhook = new Webhook({
      id: crypto.randomUUID(),
      publicId,
      merchantId: input.merchantId,
      name: input.name,
      url: input.url,
      secret,
      events: input.events,
      status: "ACTIVE",
      failureCount: 0,
      lastCalledAt: null,
      lastSuccess: null,
      lastFailure: null,
      lastError: null,
      devMode: input.devMode ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return { webhook, secret };
  }

  static fromPersistence(props: WebhookProps): Webhook {
    return new Webhook(props);
  }

  /**
   * Gera a assinatura HMAC para um payload
   */
  static generateSignature(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Verifica se a assinatura é válida
   */
  static verifySignature(
    payload: string,
    secret: string,
    signature: string
  ): boolean {
    const expected = Webhook.generateSignature(payload, secret);
    return expected === signature;
  }

  isActive(): boolean {
    return this.status === "ACTIVE";
  }

  hasEvent(event: string): boolean {
    return this.events.includes(event);
  }

  /**
   * Retorna um novo Webhook com status atualizado após sucesso
   */
  markSuccess(): Webhook {
    const now = new Date();
    return new Webhook({
      ...this.toProps(),
      status: "ACTIVE",
      failureCount: 0,
      lastCalledAt: now,
      lastSuccess: now,
      lastError: null,
      updatedAt: now,
    });
  }

  /**
   * Retorna um novo Webhook com status atualizado após falha
   */
  markFailure(error: string): Webhook {
    const now = new Date();
    const newFailureCount = this.failureCount + 1;
    const MAX_FAILURES = 10;

    return new Webhook({
      ...this.toProps(),
      status: newFailureCount >= MAX_FAILURES ? "FAILED" : this.status,
      failureCount: newFailureCount,
      lastCalledAt: now,
      lastFailure: now,
      lastError: error,
      updatedAt: now,
    });
  }

  /**
   * Retorna um novo Webhook desativado
   */
  deactivate(): Webhook {
    const now = new Date();
    return new Webhook({
      ...this.toProps(),
      status: "INACTIVE",
      updatedAt: now,
    });
  }

  /**
   * Retorna um novo Webhook reativado
   */
  activate(): Webhook {
    const now = new Date();
    return new Webhook({
      ...this.toProps(),
      status: "ACTIVE",
      failureCount: 0,
      updatedAt: now,
    });
  }

  /**
   * Retorna um novo Webhook com dados atualizados
   */
  update(data: { name?: string; url?: string; events?: string[] }): Webhook {
    const now = new Date();

    // Validar URL se fornecida
    if (data.url && !this.devMode && !data.url.startsWith("https://")) {
      throw new WebhookValidationError("URL deve usar HTTPS em produção");
    }

    // Validar eventos se fornecidos
    if (data.events) {
      const invalidEvents = data.events.filter(
        (e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent)
      );
      if (invalidEvents.length > 0) {
        throw new WebhookValidationError(
          `Eventos inválidos: ${invalidEvents.join(", ")}`
        );
      }
    }

    return new Webhook({
      ...this.toProps(),
      name: data.name ?? this.name,
      url: data.url ?? this.url,
      events: data.events ?? this.events,
      updatedAt: now,
    });
  }

  toProps(): WebhookProps {
    return {
      id: this.id,
      publicId: this.publicId,
      merchantId: this.merchantId,
      name: this.name,
      url: this.url,
      secret: this.secret,
      events: this.events,
      status: this.status,
      failureCount: this.failureCount,
      lastCalledAt: this.lastCalledAt,
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure,
      lastError: this.lastError,
      devMode: this.devMode,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/**
 * Erros específicos de Webhook
 */
export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

export class WebhookNotFoundError extends Error {
  constructor(id: string) {
    super(`Webhook não encontrado: ${id}`);
    this.name = "WebhookNotFoundError";
  }
}

export class WebhookUnauthorizedError extends Error {
  constructor() {
    super("Não autorizado a acessar este webhook");
    this.name = "WebhookUnauthorizedError";
  }
}

