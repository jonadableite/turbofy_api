import { randomUUID } from "crypto";

interface PixCreateResponse {
  id: string;
  status: string;
  amountCents: number;
  description?: string | null;
  pix: {
    qrCode: string | null;
    copyPaste: string | null;
    expiresAt: string;
  };
  splits?: Array<{ id: string; merchantId: string; amountCents: number; percentage?: number | null }>;
  createdAt: string;
}

interface PixGetResponse {
  id: string;
  status: string;
  amountCents: number;
  description?: string | null;
  pix: {
    qrCode: string;
    copyPaste: string;
    expiresAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const assertNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing/invalid`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const apiBaseUrl = process.env.API_BASE_URL?.trim() || "http://localhost:3000";
  const clientId = getRequiredEnv("RIFEIRO_CLIENT_ID");
  const clientSecret = getRequiredEnv("RIFEIRO_CLIENT_SECRET");

  const amountCents = Number(process.env.AMOUNT_CENTS ?? "10000");
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("AMOUNT_CENTS must be a positive integer");
  }

  const idempotencyKey = process.env.IDEMPOTENCY_KEY?.trim() || `e2e-${randomUUID()}`;

  const createRes = await fetch(`${apiBaseUrl}/rifeiro/pix`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      amountCents,
      description: "E2E Pix via client credentials",
      metadata: { source: "script", testRunId: idempotencyKey },
    }),
  });

  const createJson = (await createRes.json()) as unknown;
  if (!createRes.ok) {
    throw new Error(`POST /rifeiro/pix failed (${createRes.status}): ${JSON.stringify(createJson)}`);
  }

  const created = createJson as PixCreateResponse;
  const chargeId = assertNonEmptyString(created.id, "response.id");

  if (!created.pix) {
    throw new Error("response.pix missing");
  }

  assertNonEmptyString(created.pix.qrCode, "response.pix.qrCode");
  assertNonEmptyString(created.pix.copyPaste, "response.pix.copyPaste");

  const getRes = await fetch(`${apiBaseUrl}/rifeiro/pix/${chargeId}`, {
    method: "GET",
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
    },
  });

  const getJson = (await getRes.json()) as unknown;
  if (!getRes.ok) {
    throw new Error(`GET /rifeiro/pix/:id failed (${getRes.status}): ${JSON.stringify(getJson)}`);
  }

  const fetched = getJson as PixGetResponse;
  if (!fetched.pix) {
    throw new Error("GET response.pix missing");
  }

  assertNonEmptyString(fetched.pix.qrCode, "GET response.pix.qrCode");
  assertNonEmptyString(fetched.pix.copyPaste, "GET response.pix.copyPaste");

  // Saída amigável (sem imprimir secrets)
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBaseUrl,
        idempotencyKey,
        chargeId,
        amountCents,
        pix: {
          qrCodeLength: fetched.pix.qrCode.length,
          copyPasteLength: fetched.pix.copyPaste.length,
          expiresAt: fetched.pix.expiresAt,
        },
        splitsCount: created.splits?.length ?? 0,
      },
      null,
      2
    )
  );
};

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
