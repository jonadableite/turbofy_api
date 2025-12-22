/**
 * Cliente HTTP para integração com a API Transfeera
 * 
 * @security Autenticação OAuth2 com client credentials
 * @performance Cache de token de acesso (30 minutos de validade)
 * @maintainability Cliente isolado e reutilizável
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";
import https from "https";
import { env } from "../../../config/env";
import { logger } from "../../logger";
import { PaymentProviderError } from "./PaymentProviderErrors";

interface TransfeeraTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TransfeeraPixKey {
  id: string;
  key_type: "EMAIL" | "TELEFONE" | "CNPJ" | "CPF" | "CHAVE_ALEATORIA";
  key: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TransfeeraQrCodeResponse {
  id: string;
  qrcode_type: "ESTATICO" | "COBRANCA_IMEDIATA" | "COBRANCA_COM_VENCIMENTO";
  status: string;
  txid: string;
  integration_id?: string;
  pix_key: TransfeeraPixKey;
  emv_payload: string;
  image_base64: string;
  created_at: string;
  updated_at: string;
  original_value?: number;
  expiration?: number;
}

interface TransfeeraBalanceResponse {
  value: number;
  waiting_value: number;
}

interface TransfeeraCashInResponse {
  id: string;
  value: number;
  type: "DEPOSIT" | "DEPOSIT_REFUND";
  end2end_id: string;
  txid?: string;
  integration_id?: string;
  pix_key: string;
  pix_description?: string;
  payer: {
    name: string;
    document: string;
    account_type: string;
    account: string;
    account_digit: string;
    agency: string;
    bank: {
      name: string;
      code: string;
      ispb: string;
    };
  };
  receiver: {
    name: string;
    document: string;
  };
}

interface TransfeeraBatchResponse {
  id: string;
  status: string;
  name?: string;
  type: "TRANSFERENCIA" | "BOLETO";
  created_at: string;
}

interface TransfeeraTransferRequest {
  value: number;
  integration_id?: string;
  idempotency_key?: string;
  pix_description?: string;
  payment_date?: string;
  emv?: string;
  destination_bank_account?: {
    pix_key_type?: string;
    pix_key?: string;
    email?: string;
    name?: string;
    cpf_cnpj?: string;
    bank_code?: string | number;
    agency?: string;
    account?: string;
    account_digit?: string;
    account_type?: string;
  };
  pix_key_validation?: {
    cpf_cnpj?: string;
  };
}

interface TransfeeraTransferResponse {
  id: string;
  value: number;
  status: string;
  batch_id: string;
  integration_id?: string;
  idempotency_key?: string;
  payment_date?: string | null;
  payment_method?: string | null;
  pix_description?: string | null;
  pix_end2end_id?: string | null;
  emv?: string | null;
  receipt_url?: string | null;
  bank_receipt_url?: string | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
}

interface TransfeeraDictKeyResponse {
  key: string;
  key_type: "EMAIL" | "CPF" | "CNPJ" | "TELEFONE" | "CHAVE_ALEATORIA";
  end2end_id?: string;
}

interface PayoutRecurrence {
  id: string;
  status: "active" | "draft" | "canceled";
  interval: number;
  interval_type: "day" | "month";
  number_of_payments: number | null;
  next_payment_at: string | null;
}

interface PayoutRecurrencePayout {
  id: number | string;
  batch_id: number | string;
  amount: number;
  status: string;
  payment_method: string;
  external_id?: string | null;
  idempotency_key?: string | null;
  description?: string | null;
  error?: string | null;
  payment_date?: string | null;
  finished_at?: string | null;
  returned_at?: string | null;
  created_at?: string | null;
  receipt_url?: string | null;
  bank_receipt_url?: string | null;
  authorization_code?: string | null;
  is_withdraw?: string | null;
  receiver?: {
    name?: string;
    tax_id?: string;
    email?: string;
    institution_code?: string;
    branch_number?: string;
    account_number?: string;
    account_type?: string;
    pix_key?: string;
    pix_key_type?: string;
  };
  payment_method_details?: {
    pix?: {
      description?: string;
      end_to_end_id?: string;
    };
  };
}

interface ContaCertaBank {
  code: string;
  name: string;
  ispb: string;
  spi_participant_type: string;
  image?: string;
}

type ContaCertaValidationType = "BASICA" | "MICRO_DEPOSITO";

interface ContaCertaValidationBankPayload {
  name: string;
  cpf_cnpj: string;
  bank_code?: string;
  bank_ispb?: string | null;
  agency: string;
  agency_digit?: string | null;
  account: string;
  account_digit: string;
  account_type: string;
  integration_id?: string;
  micro_deposit_value?: number;
  micro_deposit_method?: "PIX" | "TRANSFERENCIA";
  pix_description?: string;
}

interface ContaCertaValidationPixPayload {
  pix_key: string;
  pix_key_type: "EMAIL" | "CPF" | "CNPJ" | "TELEFONE" | "CHAVE_ALEATORIA";
  integration_id?: string;
  pix_key_validation?: {
    cpf_cnpj?: string;
  };
  micro_deposit_value?: number;
  micro_deposit_method?: "PIX" | "TRANSFERENCIA";
  pix_description?: string;
}

interface ContaCertaValidationResponse {
  id: string;
  type: ContaCertaValidationType;
  integration_id?: string | null;
  created_at: string;
  pre_validated_at?: string | null;
  validated_at?: string | null;
  bank_code?: string | null;
  bank_ispb?: string | null;
  valid: boolean;
  errors: Array<{
    message: string;
    field?: string;
    suggestion?: Record<string, unknown> | null;
    errorCode?: string;
  }>;
  receipt_url?: string | null;
  bank_receipt_url?: string | null;
  micro_deposit_status?: string | null;
  micro_deposit_value?: number | null;
  micro_deposit_method?: string | null;
  pix_description?: string | null;
  source?: string;
  data?: Record<string, unknown>;
}

interface ContaCertaValidationListResponse {
  data: ContaCertaValidationResponse[];
  metadata?: {
    pagination?: {
      itemsPerPage?: number;
      totalItems?: number;
      page?: number;
    };
  };
}

interface TransfeeraChargeReceivable {
  id: string;
  status: "created" | "processing" | "paid" | "refunded" | "canceling" | "canceled";
  amount: number;
  due_date: string;
  expiration_date: string;
  fine_amount?: number | null;
  fine_percent?: number | null;
  fine_type?: "fixed" | "percentage" | null;
  interest_amount?: number | null;
  interest_percent?: number | null;
  interest_type?: string | null;
  discount_amount?: number | null;
  discount_percent?: number | null;
  discount_type?: string | null;
  discount_dates?: Array<{ amount: number; percent: number; date: string }> | null;
  description?: string | null;
  qrcode?: { id: string; emv_payload: string } | null;
  boleto?: { id: string; barcode: string; linha_digitavel: string; identification_number: string } | null;
  payments?: Array<{
    id: string;
    amount: number;
    receipt_url?: string;
    paid_with: "boleto" | "pix";
    created_at: string;
    updated_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

// ============================
// Pix Automático (Beta)
// ============================
type PixAutomaticAuthorizationType =
  | "authorization"
  | "authorization_qrcode"
  | "immediate_payment_authorization"
  | "opt_in_authorization"
  | "static_opt_in_authorization";

type PixAutomaticAuthorizationStatus = "processing" | "accepted" | "canceled" | "failed";

type PixAutomaticFrequency = "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";

type PixAutomaticRetryPolicy = "not_allowed" | "allow_three_in_seven_days";

interface PixAutomaticAuthorizationPayer {
  name: string;
  tax_id: string;
  bank_ispb: string;
  branch: string;
  account: string;
}

interface PixAutomaticAuthorizationDebtor {
  name: string;
  tax_id: string;
}

interface PixAutomaticAuthorization {
  id: string;
  type: PixAutomaticAuthorizationType;
  status: PixAutomaticAuthorizationStatus;
  end_to_end_id: string;
  frequency: PixAutomaticFrequency;
  retry_policy: PixAutomaticRetryPolicy;
  start_date: string;
  expiration_date: string | null;
  fixed_amount: number;
  max_amount_floor: number;
  identifier: string;
  description: string;
  payer: PixAutomaticAuthorizationPayer;
  debtor: PixAutomaticAuthorizationDebtor;
  payment_qrcode_txid: string | null;
  qrcode_payload: string | null;
  qrcode_image_base64: string | null;
  error_code: string | null;
  reject_reason: string | null;
  authorized_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PixAutomaticAuthorizationList {
  meta?: {
    first?: string;
    previous?: string;
    next?: string;
    last?: string;
  };
  items: PixAutomaticAuthorization[];
}

interface PixAutomaticAuthorizationCancellation {
  id: string;
  authorization_id: string;
  end_to_end_id: string;
  status: "processing" | "accepted" | "rejected";
  reason:
    | "account_closed"
    | "business_closure"
    | "payer_deceased"
    | "request_error"
    | "suspected_fraud"
    | "requested_by_receiver"
    | "requested_by_payer"
    | "no_response_from_payer_psp";
  reject_reason: string | null;
  requester_tax_id: string;
  requested_at: string;
  created_at: string;
  updated_at: string;
}

type PixAutomaticPaymentReason = "schedule" | "retry_after_expiration_date" | "retry_after_failure";

interface PixAutomaticPaymentIntent {
  id: string;
  authorization_id: string;
  status: "processing" | "accepted" | "rejected" | "failed";
  end_to_end_id: string;
  txid: string;
  reason: PixAutomaticPaymentReason;
  expiration_date: string;
  amount: number;
  payer: {
    tax_id: string;
    bank_ispb: string;
  };
  debtor?: {
    name?: string;
    tax_id?: string;
  };
  description: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface PixAutomaticPaymentIntentList {
  meta?: {
    first?: string;
    previous?: string;
    next?: string;
    last?: string;
  };
  items: PixAutomaticPaymentIntent[];
}

interface PixAutomaticPaymentIntentCancellation {
  id: string;
  payment_intent_id: string;
  end_to_end_id: string;
  status: "processing" | "accepted" | "rejected" | "failed";
  reason:
    | "account_closed"
    | "account_blocked"
    | "authorization_revoked"
    | "settlement_failed"
    | "requested_by_payer"
    | "requested_by_receiver"
    | "other";
  requester_tax_id: string;
  requester_ispb: string;
  destination_ispb: string;
  requested_at: string;
  error_code: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================
// Accounts
// ============================
type TransfeeraAccountStatus = "pending" | "active" | "blocked" | "closed";

interface TransfeeraAccount {
  id: string;
  customer_id: string;
  status: TransfeeraAccountStatus;
  branch_number: string;
  account_number: string;
  activated_at?: string | null;
  blocked_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface TransfeeraAccountList {
  items: TransfeeraAccount[];
  meta?: {
    first?: string;
    previous?: string;
    next?: string;
    last?: string;
  };
}

// ============================
// MED (Infrações)
// ============================
type MedInfractionStatus = "pending" | "agreed" | "disagreed" | "canceled";
type MedInfractionAnalysisStatus = "pending" | "accepted" | "rejected" | "delayed";
type MedInfractionSituation =
  | "scam"
  | "account_takeover"
  | "coercion"
  | "fraudulent_access"
  | "unknown"
  | "other";

interface MedInfractionRefund {
  status: "pending" | "closed" | "canceled";
  analysis_status: "totally_accepted" | "partially_accepted" | "rejected";
  transaction_id: string;
  refunded_amount: number;
  refund_date: string;
  rejection_reason?: "no_balance" | "account_closure" | "other" | string;
}

interface MedInfraction {
  id: string;
  status: MedInfractionStatus;
  analysis_status: MedInfractionAnalysisStatus;
  analysis_date?: string | null;
  analysis_due_date?: string | null;
  analysis_description?: string | null;
  situation_type: MedInfractionSituation;
  transaction_id: string;
  amount: number;
  infraction_date: string;
  infraction_description?: string | null;
  payer_name?: string | null;
  payer_tax_id?: string | null;
  contested_at?: string | null;
  refund?: MedInfractionRefund | null;
  user?: { name?: string | null };
}

interface MedInfractionList {
  items: MedInfraction[];
  meta?: {
    next?: string;
    previous?: string;
  };
}

// ============================
// Webhooks Conta Certa
// ============================
interface ContaCertaWebhook {
  id: string;
  company_id?: string;
  url: string;
  object_types?: string[];
  schema_version?: string;
  signature_secret: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface ContaCertaWebhookEvent {
  id: string;
  date: string;
  payload: Record<string, unknown>;
  delivered: boolean;
  requests: Array<{
    id: string;
    url: string;
    request_date: string;
    response_date: string;
    response_code: number;
    response_payload: string;
  }>;
}

interface ContaCertaWebhookEventList {
  data: ContaCertaWebhookEvent[];
  metadata?: {
    pagination?: {
      itemsPerPage?: number;
      totalItems?: number;
    };
  };
}

// ============================
// Webhooks Transfeera (principal)
// ============================
interface TransfeeraWebhook {
  id: string;
  company_id?: string;
  url: string;
  object_types: string[];
  schema_version?: string;
  signature_secret: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface TransfeeraWebhookEvent {
  id: string;
  date: string;
  payload: Record<string, unknown>;
  delivered: boolean;
  requests: Array<{
    id: string;
    url: string;
    request_date: string;
    response_date: string;
    response_code: number;
    response_payload: string;
  }>;
}

interface TransfeeraWebhookEventList {
  data: TransfeeraWebhookEvent[];
  metadata?: {
    pagination?: {
      itemsPerPage?: number;
      totalItems?: number;
    };
  };
}

interface TransfeeraChargeResponse {
  id: string;
  payment_methods: ("pix" | "boleto")[];
  payer: {
    name: string;
    trade_name?: string;
    tax_id: string;
    address?: {
      street?: string;
      number?: string;
      complement?: string;
      district?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
  receiver?: {
    name?: string;
    trade_name?: string;
    tax_id?: string;
    pix_key?: string;
    address?: {
      street?: string;
      number?: string;
      complement?: string;
      district?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
  external_id?: string;
  receivables: TransfeeraChargeReceivable[];
  created_at: string;
  updated_at: string;
}

interface TransfeeraPaymentLinkResponse {
  id: string;
  status: "pending" | "waiting_payment" | "paid" | "expired";
  payment_methods: ("pix" | "boleto" | "credit_card")[];
  amount: number;
  name: string;
  description?: string;
  link: string;
  expires_at: string;
  payment_method_details?: {
    boleto?: { days_until_due?: number };
    credit_card?: { max_installments?: number };
  };
  created_at: string;
  updated_at: string;
}

export class TransfeeraClient {
  private axiosInstance: AxiosInstance;
  private contaCertaAxios: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private validationToken: string | null = null;
  private validationTokenExpiresAt: number = 0;
  private readonly userAgent: string;
  private readonly httpsAgent: https.Agent | undefined;

  constructor() {
    this.userAgent = `Turbofy Gateway (contato@turbofy.com)`;

    this.httpsAgent = this.buildHttpsAgent();

    // Guardrails: evitar “produção” apontando para sandbox por engano
    if (env.NODE_ENV === "production") {
      if (env.TRANSFEERA_API_URL.includes("sandbox")) {
        logger.warn(
          { transfeeraApiUrl: env.TRANSFEERA_API_URL },
          "TRANSFEERA_API_URL está apontando para sandbox em produção"
        );
      }
      if (env.TRANSFEERA_LOGIN_URL.includes("sandbox")) {
        logger.warn(
          { transfeeraLoginUrl: env.TRANSFEERA_LOGIN_URL },
          "TRANSFEERA_LOGIN_URL está apontando para sandbox em produção"
        );
      }
      if (env.CONTACERTA_API_URL.includes("sandbox")) {
        logger.warn(
          { contaCertaApiUrl: env.CONTACERTA_API_URL },
          "CONTACERTA_API_URL está apontando para sandbox em produção"
        );
      }
    }
    
    this.axiosInstance = axios.create({
      baseURL: env.TRANSFEERA_API_URL,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": this.userAgent,
      },
      timeout: 30000, // 30 segundos
      httpsAgent: this.httpsAgent,
    });

    this.contaCertaAxios = axios.create({
      baseURL: env.CONTACERTA_API_URL,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": this.userAgent,
      },
      timeout: 30000,
      httpsAgent: this.httpsAgent,
    });

    this.setupInterceptors(this.axiosInstance, "payments");
    this.setupInterceptors(this.contaCertaAxios, "validation");
  }

  private async authenticatePayments(): Promise<void> {
    if (!env.TRANSFEERA_CLIENT_ID || !env.TRANSFEERA_CLIENT_SECRET) {
      throw new Error("Transfeera credentials not configured");
      }

    try {
      // A env pode vir com /authorization (alguns painéis fornecem URL completa).
      // Normalizamos para sempre montar `${base}/authorization`.
      const loginBaseUrl = env.TRANSFEERA_LOGIN_URL
        .replace(/\/authorization\/?$/i, "")
        .replace(/\/$/, "");

      const response = await axios.post<TransfeeraTokenResponse>(
        `${loginBaseUrl}/authorization`,
        {
          grant_type: "client_credentials",
          client_id: env.TRANSFEERA_CLIENT_ID,
          client_secret: env.TRANSFEERA_CLIENT_SECRET,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": this.userAgent,
          },
          httpsAgent: this.httpsAgent,
        }
      );

      this.accessToken = response.data.access_token;
      // Token expira em 30 minutos, renovar 2 minutos antes
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 120) * 1000;

      logger.info({ expiresIn: response.data.expires_in }, "Transfeera authentication successful");
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
        logger.error(
          {
          error: axiosError.message,
          status,
          data: axiosError.response?.data,
        },
        "Failed to authenticate with Transfeera"
        );
      if (status === 401 || status === 403) {
        // Em produção, os hosts *.mtls.transfeera.com exigem certificado de cliente (mTLS).
        // Quando não configurado, a Transfeera responde 403 com "mTLS required".
        const message =
          status === 403
            ? "Transfeera authentication failed (mTLS required)"
            : "Transfeera authentication failed (unauthorized)";
        throw new PaymentProviderError({
          statusCode: status,
          code: "TRANSFEERA_UNAUTHORIZED",
          message,
        });
      }
      throw new Error(`Transfeera authentication failed: ${axiosError.message}`);
    }
  }

  private async authenticateValidations(): Promise<void> {
    const clientId = env.CONTACERTA_CLIENT_ID ?? env.TRANSFEERA_CLIENT_ID;
    const clientSecret = env.CONTACERTA_CLIENT_SECRET ?? env.TRANSFEERA_CLIENT_SECRET;
    const loginUrl = env.CONTACERTA_LOGIN_URL ?? env.TRANSFEERA_LOGIN_URL;

    if (!clientId || !clientSecret) {
      throw new Error("Conta Certa credentials not configured");
    }

    try {
      const loginBaseUrl = loginUrl.replace(/\/authorization\/?$/i, "").replace(/\/$/, "");
      const response = await axios.post<TransfeeraTokenResponse>(
        `${loginBaseUrl}/authorization`,
        {
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": this.userAgent,
          },
          httpsAgent: this.httpsAgent,
        }
      );

      this.validationToken = response.data.access_token;
      this.validationTokenExpiresAt = Date.now() + (response.data.expires_in - 120) * 1000;

      logger.info({ expiresIn: response.data.expires_in }, "Conta Certa authentication successful");
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error(
        {
          error: axiosError.message,
          status: axiosError.response?.status,
          data: axiosError.response?.data,
        },
        "Failed to authenticate with Conta Certa"
      );
      throw new Error(`Conta Certa authentication failed: ${axiosError.message}`);
    }
  }

  private async getToken(tokenType: "payments" | "validation"): Promise<string> {
    if (tokenType === "payments") {
      if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
        await this.authenticatePayments();
      }
      if (!this.accessToken) {
        throw new Error("Transfeera access token missing after authentication");
      }
      return this.accessToken;
    }

    if (!this.validationToken || Date.now() >= this.validationTokenExpiresAt) {
      await this.authenticateValidations();
    }
    if (!this.validationToken) {
      throw new Error("Conta Certa validation token missing after authentication");
    }
    return this.validationToken;
  }

  private setupInterceptors(instance: AxiosInstance, tokenType: "payments" | "validation"): void {
    instance.interceptors.request.use(
      async (config) => {
        const token = await this.getToken(tokenType);
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ error?: string; message?: string }>) => {
        if (error.response?.status === 401) {
          logger.warn({ error: `${tokenType} token expired, renewing...` });
          if (tokenType === "payments") {
            this.accessToken = null;
            this.tokenExpiresAt = 0;
          } else {
            this.validationToken = null;
            this.validationTokenExpiresAt = 0;
          }
          const token = await this.getToken(tokenType);

          if (error.config) {
            error.config.headers.Authorization = `Bearer ${token}`;
            return instance.request(error.config);
    }
        }

        logger.error(
          {
            error: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url,
          },
          "Transfeera API error"
        );

        return Promise.reject(error);
      }
    );
  }

  /**
   * Cria uma chave Pix na Transfeera
   */
  async createPixKey(key: string): Promise<TransfeeraPixKey> {
    const response = await this.axiosInstance.post<TransfeeraPixKey>("/pix/key", {
      key,
    });

    return response.data;
  }

  /**
   * Consulta todas as chaves Pix registradas
   */
  async listPixKeys(): Promise<TransfeeraPixKey[]> {
    const response = await this.axiosInstance.get<TransfeeraPixKey[]>("/pix/key");
    return response.data;
  }

  /**
   * Consulta uma chave Pix por ID
   */
  async getPixKeyById(keyId: string): Promise<TransfeeraPixKey> {
    const response = await this.axiosInstance.get<TransfeeraPixKey>(`/pix/key/${keyId}`);
    return response.data;
  }

  /**
   * Cria um QR Code estático
   */
  async createStaticQrCode(params: {
    pixKey: string;
    value?: number;
    txid?: string;
    integrationId?: string;
    additionalInfo?: string;
  }): Promise<TransfeeraQrCodeResponse> {
    const response = await this.axiosInstance.post<TransfeeraQrCodeResponse>(
      "/pix/qrcode/static",
      {
        pix_key: params.pixKey,
        value: params.value,
        txid: params.txid,
        integration_id: params.integrationId,
        additional_info: params.additionalInfo,
      }
    );

    return response.data;
  }

  /**
   * Cria uma cobrança imediata (QR Code dinâmico)
   */
  async createImmediateCharge(params: {
    pixKey: string;
    originalValue: number;
    txid?: string;
    integrationId?: string;
    expiration?: number; // segundos
    payerQuestion?: string;
    additionalInfo?: Array<{ key: string; value: string }>;
    payer?: {
      name: string;
      document: string;
    };
  }): Promise<TransfeeraQrCodeResponse> {
    const response = await this.axiosInstance.post<TransfeeraQrCodeResponse>(
      "/pix/qrcode/collection/immediate",
      {
        pix_key: params.pixKey,
        original_value: params.originalValue,
        txid: params.txid,
        integration_id: params.integrationId,
        expiration: params.expiration ?? 86400, // Padrão 24 horas
        payer_question: params.payerQuestion,
        additional_info: params.additionalInfo,
        payer: params.payer,
      }
    );

    return response.data;
  }

  /**
   * Cria uma cobrança com vencimento (boleto)
   */
  async createDueDateCharge(params: {
    pixKey: string;
    dueDate: string; // ISO date string
    originalValue: number;
    txid?: string;
    integrationId?: string;
    expirationAfterDueDate?: number;
    payer: {
      name: string;
      document: string;
      email?: string;
      postalCode?: string;
      city?: string;
      state?: string;
      address?: string;
    };
    payerQuestion?: string;
    additionalInfo?: Array<{ key: string; value: string }>;
  }): Promise<TransfeeraQrCodeResponse> {
    const response = await this.axiosInstance.post<TransfeeraQrCodeResponse>(
      "/pix/qrcode/collection/dueDate",
      {
        pix_key: params.pixKey,
        due_date: params.dueDate,
        original_value: params.originalValue,
        txid: params.txid,
        integration_id: params.integrationId,
        expiration_after_due_date: params.expirationAfterDueDate ?? 0,
        payer: params.payer,
        payer_question: params.payerQuestion,
        additional_info: params.additionalInfo,
      }
    );

    return response.data;
  }

  /**
   * Consulta saldo disponível
   */
  async getBalance(): Promise<TransfeeraBalanceResponse> {
    const response = await this.axiosInstance.get<TransfeeraBalanceResponse>("/statement/balance");
    return response.data;
  }

  /**
   * Consulta Pix recebidos
   */
  async getCashIn(params?: {
    page?: string;
    pageSize?: string;
    type?: "DEPOSIT" | "DEPOSIT_REFUND" | "PENDING_DEPOSIT_REFUND" | "CANCELLED_DEPOSIT_REFUND";
    initialDate?: string;
    endDate?: string;
    pixKey?: string;
    txid?: string;
    integrationId?: string;
    value?: string;
    payerDocument?: string;
  }): Promise<{ entries: TransfeeraCashInResponse[]; pagination: unknown }> {
    const response = await this.axiosInstance.get<{
      entries: TransfeeraCashInResponse[];
      pagination: unknown;
    }>("/pix/cashin", {
      params,
    });

    return response.data;
  }

  /**
   * Consulta um Pix recebido por end2end_id
   */
  async getCashInByEnd2EndId(end2endId: string): Promise<TransfeeraCashInResponse> {
    const response = await this.axiosInstance.get<TransfeeraCashInResponse>(
      `/pix/cashin/${end2endId}`
    );
    return response.data;
  }

  async createBatch(params: {
    type: "TRANSFERENCIA" | "BOLETO";
    autoClose?: boolean;
    name?: string;
    transfers?: TransfeeraTransferRequest[];
  }): Promise<TransfeeraBatchResponse> {
    const response = await this.axiosInstance.post<TransfeeraBatchResponse>("/batch", {
      type: params.type,
      auto_close: params.autoClose ?? true,
      name: params.name,
      transfers: params.transfers,
    });
    return response.data;
  }

  async getBatch(id: string): Promise<TransfeeraBatchResponse> {
    const response = await this.axiosInstance.get<TransfeeraBatchResponse>(`/batch/${id}`);
    return response.data;
  }

  async listBatches(params?: {
    initialDate?: string;
    endDate?: string;
    page?: number;
    type?: "TRANSFERENCIA" | "BOLETO";
    search?: string;
  }): Promise<TransfeeraBatchResponse[]> {
    const response = await this.axiosInstance.get<TransfeeraBatchResponse[]>("/batch", {
      params,
    });
    return response.data;
  }

  async closeBatch(id: string): Promise<TransfeeraBatchResponse> {
    const response = await this.axiosInstance.post<TransfeeraBatchResponse>(`/batch/${id}/close`);
    return response.data;
  }

  async deleteBatch(id: string): Promise<void> {
    await this.axiosInstance.delete(`/batch/${id}`);
  }

  async createTransfer(batchId: string, transfer: TransfeeraTransferRequest): Promise<TransfeeraTransferResponse> {
    const response = await this.axiosInstance.post<TransfeeraTransferResponse>(
      `/batch/${batchId}/transfer`,
      {
        ...transfer,
        destination_bank_account: transfer.destination_bank_account,
        pix_key_validation: transfer.pix_key_validation,
      }
    );
    return response.data;
  }

  async listTransfersInBatch(batchId: string): Promise<TransfeeraTransferResponse[]> {
    const response = await this.axiosInstance.get<TransfeeraTransferResponse[]>(`/batch/${batchId}/transfer`);
    return response.data;
  }

  async getTransfer(id: string): Promise<TransfeeraTransferResponse> {
    const response = await this.axiosInstance.get<TransfeeraTransferResponse>(`/transfer/${id}`);
    return response.data;
  }

  async deleteTransfer(batchId: string, id: string): Promise<void> {
    await this.axiosInstance.delete(`/batch/${batchId}/transfer/${id}`);
  }

  async validatePixKey(key: string, keyType: "EMAIL" | "CPF" | "CNPJ" | "TELEFONE" | "CHAVE_ALEATORIA"): Promise<TransfeeraDictKeyResponse> {
    const response = await this.axiosInstance.get<TransfeeraDictKeyResponse>(`/pix/dict_key/${key}`, {
      params: { key_type: keyType },
    });
    return response.data;
  }

  async parsePixQrCode(params: { emv: string; cityCode?: string; paymentDate?: string }): Promise<unknown> {
    const response = await this.axiosInstance.post(
      "/pix/qrcode/parse",
      {
        emv: params.emv,
        city_code: params.cityCode,
        payment_date: params.paymentDate,
      }
    );
    return response.data;
  }

  async listBanks(pix?: boolean): Promise<ContaCertaBank[]> {
    const response = await this.contaCertaAxios.get<ContaCertaBank[]>("/bank", {
      params: pix !== undefined ? { pix } : undefined,
    });
    return response.data;
  }

  async createValidation(
    type: ContaCertaValidationType,
    payload: ContaCertaValidationBankPayload | ContaCertaValidationPixPayload
  ): Promise<ContaCertaValidationResponse> {
    const response = await this.contaCertaAxios.post<ContaCertaValidationResponse>(
      "/validation",
      payload,
      { params: { type } }
    );
    return response.data;
  }

  async getValidation(id: string): Promise<ContaCertaValidationResponse> {
    const response = await this.contaCertaAxios.get<ContaCertaValidationResponse>(`/validation/${id}`);
    return response.data;
  }

  async listValidations(params: {
    initialDate: string;
    endDate: string;
    page: number;
    type?: ContaCertaValidationType;
    valid?: boolean;
    microDepositMethod?: "PIX" | "TRANSFERENCIA";
    source?: "APP" | "API";
  }): Promise<ContaCertaValidationListResponse> {
    const response = await this.contaCertaAxios.get<ContaCertaValidationListResponse>("/validation", {
      params,
    });
    return response.data;
  }

  /**
   * Lista recorrências de payout
   */
  async listPayoutRecurrences(): Promise<PayoutRecurrence[]> {
    const response = await this.axiosInstance.get<PayoutRecurrence[]>("/payout_recurrences");
    return response.data;
  }

  /**
   * Lista pagamentos de uma recorrência específica
   */
  async listPayoutsByRecurrence(recurrenceId: string): Promise<PayoutRecurrencePayout[]> {
    const response = await this.axiosInstance.get<PayoutRecurrencePayout[]>(
      `/payout_recurrences/${recurrenceId}/payouts`
    );
    return response.data;
  }

  /**
   * Cancela uma recorrência ativa
   */
  async cancelPayoutRecurrence(recurrenceId: string): Promise<void> {
    await this.axiosInstance.put(`/payout_recurrences/${recurrenceId}/cancel`);
  }

  /**
   * Opera chaves Pix: delete, resend verification, verify, claim, confirm, cancel claim
   */
  async deletePixKey(id: string): Promise<void> {
    await this.axiosInstance.delete(`/pix/key/${id}`);
  }

  async resendPixVerificationCode(id: string): Promise<void> {
    await this.axiosInstance.put(`/pix/key/${id}/resendVerificationCode`);
  }

  async verifyPixKey(id: string, code: string): Promise<TransfeeraPixKey> {
    const response = await this.axiosInstance.put<TransfeeraPixKey>(`/pix/key/${id}/verify`, { code });
    return response.data;
  }

  async claimPixKey(id: string): Promise<void> {
    await this.axiosInstance.post(`/pix/key/${id}/claim`);
  }

  async confirmPixKeyClaim(id: string): Promise<void> {
    await this.axiosInstance.post(`/pix/key/${id}/claim/confirm`);
  }

  async cancelPixKeyClaim(id: string): Promise<void> {
    await this.axiosInstance.post(`/pix/key/${id}/claim/cancel`);
  }

  // =====================================================
  // QR Code Operations
  // =====================================================

  /**
   * Lista QR Codes com filtros opcionais
   */
  async listQrCodes(params?: {
    qrcodeType?: "ESTATICO" | "COBRANCA_IMEDIATA" | "COBRANCA_COM_VENCIMENTO";
    createdAtGte?: string;
    createdAtLte?: string;
    settledAtGte?: string;
    settledAtLte?: string;
    status?: "ATIVA" | "CONCLUIDA" | "REMOVIDA_PELO_USUARIO_RECEBEDOR" | "REMOVIDA_PELO_PSP";
    page?: number;
  }): Promise<{ data: TransfeeraQrCodeResponse[]; metadata?: { pagination?: { itemsPerPage?: number; totalItems?: number } } }> {
    const response = await this.axiosInstance.get<{ data: TransfeeraQrCodeResponse[]; metadata?: { pagination?: { itemsPerPage?: number; totalItems?: number } } }>("/pix/qrcode", {
      params: {
        qrcode_type: params?.qrcodeType,
        created_at__gte: params?.createdAtGte,
        created_at__lte: params?.createdAtLte,
        settled_at__gte: params?.settledAtGte,
        settled_at__lte: params?.settledAtLte,
        status: params?.status,
        page: params?.page,
      },
    });
    return response.data;
  }

  /**
   * Busca QR Code por ID ou txid
   */
  async getQrCode(idOrTxid: string): Promise<TransfeeraQrCodeResponse & { pix_received?: TransfeeraCashInResponse }> {
    const response = await this.axiosInstance.get<TransfeeraQrCodeResponse & { pix_received?: TransfeeraCashInResponse }>(`/pix/qrcode/${idOrTxid}`);
    return response.data;
  }

  /**
   * Revoga um QR Code
   */
  async revokeQrCode(idOrTxid: string): Promise<TransfeeraQrCodeResponse> {
    const response = await this.axiosInstance.delete<TransfeeraQrCodeResponse>(`/pix/qrcode/${idOrTxid}`);
    return response.data;
  }

  // =====================================================
  // CashIn Refund Operations
  // =====================================================

  /**
   * Solicita devolução de CashIn Pix recebido
   */
  async requestCashInRefund(end2endId: string, params: {
    value: number;
    integrationId?: string;
  }): Promise<{
    id: string;
    original_end2end_id: string;
    value: number;
    integration_id?: string;
    status: string;
    error_code?: string;
    error_message?: string;
    created_at: string;
    updated_at: string;
  }> {
    const response = await this.axiosInstance.post(`/pix/cashin/${end2endId}/refund`, {
      value: params.value,
      integration_id: params.integrationId,
    });
    return response.data;
  }

  /**
   * Consulta devoluções de um CashIn Pix
   */
  async listCashInRefunds(end2endId: string): Promise<{
    entries: Array<{
      id: string;
      value: number;
      type: "DEPOSIT_REFUND";
      error_code?: string | null;
      error_message?: string | null;
      return_id: string;
      end2end_id: string;
      txid?: string | null;
      integration_id?: string | null;
      receipt_file_url?: string;
      pix_key?: string;
      payer?: TransfeeraCashInResponse["payer"];
      receiver?: TransfeeraCashInResponse["receiver"];
    }>;
    metadata?: { pagination?: { itemsPerPage?: number; totalItems?: number } };
  }> {
    const response = await this.axiosInstance.get(`/pix/cashin/${end2endId}/refund`);
    return response.data;
  }

  // =====================================================
  // Charges (Cobranças) - Novo formato Transfeera
  // =====================================================

  /**
   * Cria uma cobrança (formato novo Transfeera)
   */
  async createChargeV2(params: {
    paymentMethods: ("pix" | "boleto")[];
    amount: number;
    dueDate: string;
    expirationDate: string;
    payer: {
      name: string;
      tradeName?: string;
      taxId: string;
      address?: {
        street?: string;
        number?: string;
        complement?: string;
        district?: string;
        city?: string;
        state?: string;
        postalCode?: string;
      };
    };
    paymentMethodDetails?: {
      pix?: { pixKey?: string };
    };
    fineAmount?: number;
    finePercent?: number;
    fineType?: "fixed" | "percentage";
    interestAmount?: number;
    interestPercent?: number;
    interestType?: "fixed_per_day" | "fixed_per_working_day" | "percentage_per_month" | "percentage_per_month_working_days";
    discountAmount?: number;
    discountPercent?: number;
    discountType?: string;
    discountDates?: Array<{ amount?: number; percent?: number; date: string }>;
    description?: string;
    externalId?: string;
  }): Promise<TransfeeraChargeResponse> {
    const response = await this.axiosInstance.post<TransfeeraChargeResponse>("/charges", {
      payment_methods: params.paymentMethods,
      amount: params.amount,
      due_date: params.dueDate,
      expiration_date: params.expirationDate,
      payer: {
        name: params.payer.name,
        trade_name: params.payer.tradeName,
        tax_id: params.payer.taxId,
        address: params.payer.address ? {
          street: params.payer.address.street,
          number: params.payer.address.number,
          complement: params.payer.address.complement,
          district: params.payer.address.district,
          city: params.payer.address.city,
          state: params.payer.address.state,
          postal_code: params.payer.address.postalCode,
        } : undefined,
      },
      payment_method_details: params.paymentMethodDetails ? {
        pix: params.paymentMethodDetails.pix ? { pix_key: params.paymentMethodDetails.pix.pixKey } : undefined,
      } : undefined,
      fine_amount: params.fineAmount,
      fine_percent: params.finePercent,
      fine_type: params.fineType,
      interest_amount: params.interestAmount,
      interest_percent: params.interestPercent,
      interest_type: params.interestType,
      discount_amount: params.discountAmount,
      discount_percent: params.discountPercent,
      discount_type: params.discountType,
      discount_dates: params.discountDates,
      description: params.description,
      external_id: params.externalId,
    });
    return response.data;
  }

  /**
   * Lista cobranças com filtros
   */
  async listCharges(params?: {
    receivableStatus?: string[];
    createdAtGte?: string;
    createdAtLte?: string;
    receivedAtGte?: string;
    receivedAtLte?: string;
    pageCursor?: string;
    pageSize?: number;
  }): Promise<{ items: TransfeeraChargeResponse[]; meta?: { first?: string; previous?: string; next?: string; last?: string } }> {
    const response = await this.axiosInstance.get<{ items: TransfeeraChargeResponse[]; meta?: { first?: string; previous?: string; next?: string; last?: string } }>("/charges", {
      params: {
        receivable_status: params?.receivableStatus,
        created_at__gte: params?.createdAtGte,
        created_at__lte: params?.createdAtLte,
        received_at__gte: params?.receivedAtGte,
        received_at__lte: params?.receivedAtLte,
        page_cursor: params?.pageCursor,
        page_size: params?.pageSize,
      },
    });
    return response.data;
  }

  /**
   * Consulta uma cobrança por ID
   */
  async getChargeV2(id: string): Promise<TransfeeraChargeResponse> {
    const response = await this.axiosInstance.get<TransfeeraChargeResponse>(`/charges/${id}`);
    return response.data;
  }

  /**
   * Cancela uma cobrança
   */
  async cancelChargeV2(id: string): Promise<TransfeeraChargeResponse> {
    const response = await this.axiosInstance.post<TransfeeraChargeResponse>(`/charges/${id}/cancel`);
    return response.data;
  }

  /**
   * Download PDF de um recebível da cobrança
   */
  async downloadChargePdf(chargeId: string, receivableId: string): Promise<ArrayBuffer> {
    const response = await this.axiosInstance.get<ArrayBuffer>(`/charges/${chargeId}/receivables/${receivableId}/pdf`, {
      responseType: "arraybuffer",
    });
    return response.data;
  }

  // =====================================================
  // Payment Links
  // =====================================================

  /**
   * Cria um link de pagamento
   */
  async createPaymentLink(params: {
    paymentMethods: ("pix" | "boleto" | "credit_card")[];
    amount: number;
    name: string;
    expiresAt: string;
    description?: string;
    paymentMethodDetails?: {
      boleto?: { daysUntilDue?: number };
      creditCard?: { maxInstallments?: number };
    };
  }): Promise<TransfeeraPaymentLinkResponse> {
    const response = await this.axiosInstance.post<TransfeeraPaymentLinkResponse>("/payment_links", {
      payment_methods: params.paymentMethods,
      amount: params.amount,
      name: params.name,
      expires_at: params.expiresAt,
      description: params.description,
      payment_method_details: params.paymentMethodDetails ? {
        boleto: params.paymentMethodDetails.boleto ? { days_until_due: params.paymentMethodDetails.boleto.daysUntilDue } : undefined,
        credit_card: params.paymentMethodDetails.creditCard ? { max_installments: params.paymentMethodDetails.creditCard.maxInstallments } : undefined,
      } : undefined,
    });
    return response.data;
  }

  /**
   * Lista links de pagamento
   */
  async listPaymentLinks(params?: {
    pageCursor?: string;
    pageSize?: number;
  }): Promise<{ items: TransfeeraPaymentLinkResponse[]; meta?: { first?: string; last?: string; next?: string; previous?: string } }> {
    const response = await this.axiosInstance.get<{ items: TransfeeraPaymentLinkResponse[]; meta?: { first?: string; last?: string; next?: string; previous?: string } }>("/payment_links", {
      params: {
        page_cursor: params?.pageCursor,
        page_size: params?.pageSize,
      },
    });
    return response.data;
  }

  /**
   * Exclui um link de pagamento
   */
  async deletePaymentLink(id: string): Promise<void> {
    await this.axiosInstance.delete(`/payment_links/${id}`);
  }

  // =====================================================
  // Statement / Balance Operations
  // =====================================================

  /**
   * Resgata saldo para conta bancária principal
   */
  async withdrawBalance(value: number): Promise<void> {
    await this.axiosInstance.post("/statement/withdraw", { value });
  }

  /**
   * Solicita relatório de extrato
   */
  async requestStatementReport(params: {
    format: "csv" | "xlsx" | "ofx" | "pdf";
    createdAtGte: string;
    createdAtLte: string;
  }): Promise<{
    id: string;
    status: "pending" | "succeeded" | "failed";
    format: string;
    created_at__gte: string;
    created_at__lte: string;
    requested_at: string;
    file_url?: string | null;
    file_name?: string | null;
  }> {
    const response = await this.axiosInstance.post("/statement_report", {
      format: params.format,
      created_at__gte: params.createdAtGte,
      created_at__lte: params.createdAtLte,
    });
    return response.data;
  }

  /**
   * Consulta relatório de extrato por ID
   */
  async getStatementReport(id: string): Promise<{
    id: string;
    status: "pending" | "succeeded" | "failed";
    format: string;
    created_at__gte: string;
    created_at__lte: string;
    requested_at: string;
    file_url?: string | null;
    file_name?: string | null;
  }> {
    const response = await this.axiosInstance.get(`/statement_report/${id}`);
    return response.data;
  }

  // =====================================================
  // Billet (Boleto) Operations
  // =====================================================

  /**
   * Consulta boleto na CIP (dados atualizados com juros/multa/desconto)
   */
  async consultBillet(code: string): Promise<{
    status: "INVALIDO" | "NAO_REGISTRADO" | "NAO_ENCONTRADO" | "IMPAGAVEL" | "PAGO" | "NAO_PAGO";
    message: string;
    barcode_details?: {
      bank_code?: string | null;
      bank_name?: string;
      barcode?: string;
      digitable_line?: string;
      due_date?: string | null;
      value?: number;
      type?: string;
    };
    payment_info?: {
      recipient_document?: string | null;
      recipient_name?: string | null;
      payer_document?: string | null;
      payer_name?: string | null;
      due_date?: string | null;
      limit_date?: string | null;
      min_value?: number | null;
      max_value?: number | null;
      fine_value?: number | null;
      interest_value?: number | null;
      original_value?: number;
      total_updated_value?: number;
      total_discount_value?: number | null;
      total_additional_value?: number | null;
    };
  }> {
    const response = await this.axiosInstance.get("/billet/consult", { params: { code } });
    return response.data;
  }

  /**
   * Cria boleto em um lote
   */
  async createBillet(batchId: string, params: {
    barcode: string;
    paymentDate: string;
    description: string;
    value?: number;
    integrationId?: string;
  }): Promise<{ id: string }> {
    const response = await this.axiosInstance.post<{ id: string }>(`/batch/${batchId}/billet`, {
      barcode: params.barcode,
      payment_date: params.paymentDate,
      description: params.description,
      value: params.value,
      integration_id: params.integrationId,
    });
    return response.data;
  }

  /**
   * Lista boletos de um lote
   */
  async listBilletsInBatch(batchId: string): Promise<Array<{
    id: string;
    value: number;
    barcode: string;
    description: string;
    due_date?: string;
    payment_date?: string;
    status: string;
    status_description?: string | null;
    created_at: string;
    integration_id?: string | null;
    batch_id: string;
    receipt_url?: string | null;
    bank_receipt_url?: string | null;
    paid_date?: string | null;
    returned_date?: string | null;
    finish_date?: string | null;
    bank_auth_code?: string | null;
    _errors?: Array<{ message: string; field?: string; code?: string }>;
    _warnings?: unknown[];
    error?: { code?: string | null; message?: string } | null;
  }>> {
    const response = await this.axiosInstance.get(`/batch/${batchId}/billet`);
    return response.data;
  }

  /**
   * Consulta um boleto por ID
   */
  async getBillet(id: string): Promise<{
    id: string;
    value: number;
    barcode: string;
    description: string;
    due_date?: string;
    payment_date?: string;
    status: string;
    status_description?: string | null;
    created_at: string;
    integration_id?: string | null;
    batch_id: string;
    receipt_url?: string | null;
    bank_receipt_url?: string | null;
    paid_date?: string | null;
    returned_date?: string | null;
    finish_date?: string | null;
    bank_auth_code?: string | null;
    error?: { code?: string | null; message?: string | null } | null;
  }> {
    const response = await this.axiosInstance.get(`/billet/${id}`);
    return response.data;
  }

  /**
   * Lista boletos com filtros
   */
  async listBillets(params: {
    initialDate: string;
    endDate: string;
    page: string;
    barcode?: string;
    status?: "CRIADA" | "AGENDADO" | "PAGO" | "FALHA" | "DEVOLVIDO";
  }): Promise<{
    data: Array<{
      id: string;
      value: number;
      barcode: string;
      description: string;
      due_date?: string;
      payment_date?: string;
      status: string;
      status_description?: string | null;
      error?: { code?: string | null; message?: string } | null;
      created_at: string;
      paid_date?: string | null;
      returned_date?: string | null;
      finish_date?: string | null;
      integration_id?: string | null;
      type?: string;
      batch_id?: string;
      receipt_url?: string | null;
      bank_receipt_url?: string | null;
      bank_auth_code?: string | null;
    }>;
    metadata?: { pagination?: { itemsPerPage?: number; totalItems?: number } };
  }> {
    const response = await this.axiosInstance.get("/billet", { params });
    return response.data;
  }

  /**
   * Remove boleto de um lote
   */
  async deleteBillet(batchId: string, id: string): Promise<void> {
    await this.axiosInstance.delete(`/batch/${batchId}/billet/${id}`);
  }

  // =====================================================
  // Pix Automático (Beta)
  // =====================================================

  async createPixAutomaticAuthorization(payload: {
    type: PixAutomaticAuthorizationType;
    frequency: PixAutomaticFrequency;
    retry_policy: PixAutomaticRetryPolicy;
    start_date: string;
    expiration_date?: string | null;
    fixed_amount?: number;
    max_amount_floor?: number;
    identifier?: string;
    description?: string;
    payer: PixAutomaticAuthorizationPayer;
    debtor: PixAutomaticAuthorizationDebtor;
    payment_qrcode_txid?: string | null;
  }): Promise<PixAutomaticAuthorization> {
    const response = await this.axiosInstance.post<PixAutomaticAuthorization>(
      "/pix/automatic/authorizations",
      payload
    );
    return response.data;
  }

  async listPixAutomaticAuthorizations(pageCursor?: string): Promise<PixAutomaticAuthorizationList> {
    const response = await this.axiosInstance.get<PixAutomaticAuthorizationList>(
      "/pix/automatic/authorizations",
      { params: { page_cursor: pageCursor } }
    );
    return response.data;
  }

  async getPixAutomaticAuthorization(id: string): Promise<PixAutomaticAuthorization> {
    const response = await this.axiosInstance.get<PixAutomaticAuthorization>(
      `/pix/automatic/authorizations/${id}`
    );
    return response.data;
  }

  async cancelPixAutomaticAuthorization(id: string): Promise<PixAutomaticAuthorizationCancellation> {
    const response = await this.axiosInstance.post<PixAutomaticAuthorizationCancellation>(
      `/pix/automatic/authorizations/${id}/cancellations`
    );
    return response.data;
  }

  async getPixAutomaticAuthorizationCancellation(
    id: string,
    cancellationId: string
  ): Promise<PixAutomaticAuthorizationCancellation> {
    const response = await this.axiosInstance.get<PixAutomaticAuthorizationCancellation>(
      `/pix/automatic/authorizations/${id}/cancellations/${cancellationId}`
    );
    return response.data;
  }

  async createPixAutomaticPaymentIntent(payload: {
    authorization_id: string;
    txid?: string;
    reason: PixAutomaticPaymentReason;
    expiration_date: string;
    amount: number;
    payer: { tax_id: string; bank_ispb: string };
    debtor?: { name?: string; tax_id?: string };
    description?: string | null;
  }): Promise<PixAutomaticPaymentIntent> {
    const response = await this.axiosInstance.post<PixAutomaticPaymentIntent>(
      "/pix/automatic/payment_intents",
      payload
    );
    return response.data;
  }

  async listPixAutomaticPaymentIntents(params?: {
    authorization_id?: string;
    page_cursor?: string;
  }): Promise<PixAutomaticPaymentIntentList> {
    const response = await this.axiosInstance.get<PixAutomaticPaymentIntentList>(
      "/pix/automatic/payment_intents",
      { params }
    );
    return response.data;
  }

  async getPixAutomaticPaymentIntent(id: string): Promise<PixAutomaticPaymentIntent> {
    const response = await this.axiosInstance.get<PixAutomaticPaymentIntent>(
      `/pix/automatic/payment_intents/${id}`
    );
    return response.data;
  }

  async cancelPixAutomaticPaymentIntent(
    id: string
  ): Promise<PixAutomaticPaymentIntentCancellation> {
    const response = await this.axiosInstance.post<PixAutomaticPaymentIntentCancellation>(
      `/pix/automatic/payment_intents/${id}/cancellations`
    );
    return response.data;
  }

  async getPixAutomaticPaymentIntentCancellation(
    id: string,
    cancellationId: string
  ): Promise<PixAutomaticPaymentIntentCancellation> {
    const response = await this.axiosInstance.get<PixAutomaticPaymentIntentCancellation>(
      `/pix/automatic/payment_intents/${id}/cancellations/${cancellationId}`
    );
    return response.data;
  }

  // =====================================================
  // Accounts
  // =====================================================

  async createAccount(customerId: string): Promise<TransfeeraAccount> {
    const response = await this.axiosInstance.post<TransfeeraAccount>("/accounts", {
      customer_id: customerId,
    });
    return response.data;
  }

  async listAccounts(params?: {
    status?: TransfeeraAccountStatus;
    page_cursor?: string;
    page_size?: number;
  }): Promise<TransfeeraAccountList> {
    const response = await this.axiosInstance.get<TransfeeraAccountList>("/accounts", {
      params,
    });
    return response.data;
  }

  async getAccount(id: string): Promise<TransfeeraAccount> {
    const response = await this.axiosInstance.get<TransfeeraAccount>(`/accounts/${id}`);
    return response.data;
  }

  async closeAccount(id: string): Promise<TransfeeraAccount> {
    const response = await this.axiosInstance.post<TransfeeraAccount>(`/accounts/${id}/close`);
    return response.data;
  }

  // =====================================================
  // MED (Infrações)
  // =====================================================

  async listMedInfractions(params?: {
    infraction_date__gte?: string;
    infraction_date__lte?: string;
    transaction_id?: string;
    analysis_status__in?: string;
    payer_tax_id?: string;
    page_cursor?: string;
    page_size?: number;
  }): Promise<MedInfractionList> {
    const response = await this.axiosInstance.get<MedInfractionList>("/med/infractions", {
      params,
    });
    return response.data;
  }

  async getMedInfraction(id: string): Promise<MedInfraction> {
    const response = await this.axiosInstance.get<MedInfraction>(`/med/infractions/${id}`);
    return response.data;
  }

  async submitMedInfractionAnalysisBatch(payload: {
    infraction_ids: string[];
    analysis: "accepted" | "rejected";
    analysis_description?: string;
  }): Promise<MedInfraction[]> {
    const response = await this.axiosInstance.post<MedInfraction[]>(
      "/med/infractions/analysis",
      payload
    );
    return response.data;
  }

  async submitMedInfractionAnalysis(
    id: string,
    payload: {
      analysis: "accepted" | "rejected";
      analysis_description: string;
      attachments?: Array<{ content: Buffer; filename: string; contentType?: string }>;
    }
  ): Promise<MedInfraction> {
    // Endpoint aceita multipart; caso nenhum attachment, envia JSON simples
    if (!payload.attachments || payload.attachments.length === 0) {
      const response = await this.axiosInstance.post<MedInfraction>(
        `/med/infractions/${id}/analysis`,
        {
          analysis: payload.analysis,
          analysis_description: payload.analysis_description,
        }
      );
      return response.data;
    }

    // Para não adicionar dependência nova, usa FormData nativa se disponível
    // (Node 18+). Se indisponível, o chamador deve fornecer sem anexos.
    const formData = new FormData();
    formData.append("analysis", payload.analysis);
    formData.append("analysis_description", payload.analysis_description);
    payload.attachments.forEach((file, index) => {
      formData.append(
        "attachments",
        file.content,
        {
          filename: file.filename || `attachment-${index + 1}`,
          contentType: file.contentType,
        } as any
      );
    });

    const response = await this.axiosInstance.post<MedInfraction>(
      `/med/infractions/${id}/analysis`,
      formData,
      {
        headers: formData.getHeaders ? formData.getHeaders() : undefined,
      }
    );
    return response.data;
  }

  // =====================================================
  // Webhooks Conta Certa
  // =====================================================

  async createContaCertaWebhook(url: string): Promise<ContaCertaWebhook> {
    const response = await this.contaCertaAxios.post<ContaCertaWebhook>("/webhook", { url });
    return response.data;
  }

  async listContaCertaWebhooks(): Promise<ContaCertaWebhook[]> {
    const response = await this.contaCertaAxios.get<ContaCertaWebhook[]>("/webhook");
    return response.data;
  }

  async updateContaCertaWebhook(id: string, url: string): Promise<void> {
    await this.contaCertaAxios.put(`/webhook/${id}`, { url });
  }

  async deleteContaCertaWebhook(id: string): Promise<void> {
    await this.contaCertaAxios.delete(`/webhook/${id}`);
  }

  async listContaCertaWebhookEvents(params: {
    initialDate: string;
    endDate: string;
    page: string;
    delivered?: string;
  }): Promise<ContaCertaWebhookEventList> {
    const response = await this.contaCertaAxios.get<ContaCertaWebhookEventList>("/webhook/event", {
      params: {
        initialDate: params.initialDate,
        endDate: params.endDate,
        page: params.page,
        delivered: params.delivered,
      },
    });
    return response.data;
  }

  async retryContaCertaWebhookEvents(dispatchIds: string[]): Promise<
    Array<{
      id: string;
      error?: string;
    }>
  > {
    const response = await this.contaCertaAxios.post("/webhook/event/retry", {
      dispatches_id: dispatchIds,
    });
    return response.data;
  }

  // =====================================================
  // Webhooks Transfeera (principal)
  // =====================================================

  async createTransfeeraWebhook(url: string, objectTypes: string[]): Promise<TransfeeraWebhook> {
    try {
      const response = await this.axiosInstance.post<TransfeeraWebhook>("/webhook", {
        url,
        object_types: objectTypes,
      });
      
      // Validar que a resposta contém os campos obrigatórios
      if (!response.data.id) {
        throw new PaymentProviderError({
          statusCode: 500,
          code: "TRANSFEERA_INVALID_RESPONSE",
          message: "Transfeera não retornou webhookId",
        });
      }
      if (!response.data.signature_secret) {
        throw new PaymentProviderError({
          statusCode: 500,
          code: "TRANSFEERA_INVALID_RESPONSE",
          message: "Transfeera não retornou signatureSecret",
        });
      }
      if (!response.data.url) {
        // Se não retornou URL, usar a que foi enviada
        response.data.url = url;
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const data = error.response.data as any;
        const message = data?.message || data?.error || error.message;
        
        logger.error(
          {
            type: "TRANSFEERA_WEBHOOK_CREATE_FAILED",
            status,
            message,
            url,
            objectTypes,
            responseData: data,
          },
          "Failed to create webhook in Transfeera"
        );
        
        throw new PaymentProviderError({
          statusCode: status,
          code: "TRANSFEERA_WEBHOOK_CREATE_FAILED",
          message: `Transfeera retornou ${status}: ${message}`,
        });
      }
      throw error;
    }
  }

  async listTransfeeraWebhooks(): Promise<TransfeeraWebhook[]> {
    const response = await this.axiosInstance.get<TransfeeraWebhook[]>("/webhook");
    return response.data;
  }

  async updateTransfeeraWebhook(id: string, url: string, objectTypes: string[]): Promise<void> {
    await this.axiosInstance.put(`/webhook/${id}`, {
      url,
      object_types: objectTypes,
    });
  }

  async deleteTransfeeraWebhook(id: string): Promise<void> {
    await this.axiosInstance.delete(`/webhook/${id}`);
  }

  async listTransfeeraWebhookEvents(params: {
    initialDate: string;
    endDate: string;
    page: string;
    delivered?: string;
    objectType?: string;
  }): Promise<TransfeeraWebhookEventList> {
    const response = await this.axiosInstance.get<TransfeeraWebhookEventList>("/webhook/event", {
      params: {
        initialDate: params.initialDate,
        endDate: params.endDate,
        page: params.page,
        delivered: params.delivered,
        objectType: params.objectType,
      },
    });
    return response.data;
  }

  private buildHttpsAgent(): https.Agent | undefined {
    const shouldUseMtls =
      env.TRANSFEERA_API_URL.includes(".mtls.") ||
      env.TRANSFEERA_LOGIN_URL.includes(".mtls.") ||
      env.CONTACERTA_API_URL.includes(".mtls.") ||
      Boolean(env.TRANSFEERA_MTLS_CERT_PATH || env.TRANSFEERA_MTLS_CERT_BASE64);

    if (!shouldUseMtls) {
      return undefined;
    }

    const cert =
      this.readSecretMaterial({
        path: env.TRANSFEERA_MTLS_CERT_PATH,
        base64: env.TRANSFEERA_MTLS_CERT_BASE64,
      }) ?? undefined;
    const key =
      this.readSecretMaterial({
        path: env.TRANSFEERA_MTLS_KEY_PATH,
        base64: env.TRANSFEERA_MTLS_KEY_BASE64,
      }) ?? undefined;
    const ca =
      this.readSecretMaterial({
        path: env.TRANSFEERA_MTLS_CA_PATH,
        base64: env.TRANSFEERA_MTLS_CA_BASE64,
      }) ?? undefined;

    if (!cert || !key) {
      logger.warn(
        {
          hasCert: Boolean(cert),
          hasKey: Boolean(key),
          hasCa: Boolean(ca),
        },
        "mTLS parece necessário, mas TRANSFEERA_MTLS_CERT_* / TRANSFEERA_MTLS_KEY_* não estão configurados"
      );
      return undefined;
    }

    return new https.Agent({
      keepAlive: true,
      cert,
      key,
      ca,
    });
  }

  private readSecretMaterial(input: {
    path?: string;
    base64?: string;
  }): string | null {
    if (input.base64) {
      try {
        return Buffer.from(input.base64, "base64").toString("utf8");
      } catch {
        return null;
      }
    }

    if (input.path) {
      try {
        return fs.readFileSync(input.path, "utf8");
      } catch {
        return null;
      }
    }

    return null;
  }
}

