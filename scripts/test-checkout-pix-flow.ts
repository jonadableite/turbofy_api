import { randomUUID } from "crypto";

interface CreateSessionResponse {
  id: string;
  chargeId: string;
  merchantId: string;
  status: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
}

interface IssueResponse {
  id: string;
  method: string | null;
  pix?: { qrCode: string; copyPaste: string; expiresAt: string };
  boleto?: { boletoUrl: string; expiresAt: string };
}

interface GetSessionResponse {
  id: string;
  chargeId: string;
  merchantId: string;
  status: string;
  amountCents: number;
  currency: string;
  description: string | null;
  pix?: { qrCode: string; copyPaste: string; expiresAt: string };
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
  const merchantId = getRequiredEnv("CHECKOUT_MERCHANT_ID");

  const amountCents = Number(process.env.AMOUNT_CENTS ?? "2590");
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("AMOUNT_CENTS must be a positive integer");
  }

  const createIdemKey = process.env.SESSION_IDEMPOTENCY_KEY?.trim() || `session-${randomUUID()}`;

  const createRes = await fetch(`${apiBaseUrl}/checkout/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": createIdemKey,
    },
    body: JSON.stringify({
      merchantId,
      amountCents,
      currency: "BRL",
      description: "E2E Checkout Pix",
      metadata: { source: "script", testRunId: createIdemKey },
    }),
  });

  const createJson = (await createRes.json()) as unknown;
  if (!createRes.ok) {
    throw new Error(`POST /checkout/sessions failed (${createRes.status}): ${JSON.stringify(createJson)}`);
  }

  const session = createJson as CreateSessionResponse;
  const sessionId = assertNonEmptyString(session.id, "session.id");
  const chargeId = assertNonEmptyString(session.chargeId, "session.chargeId");

  const issueIdemKey = process.env.ISSUE_IDEMPOTENCY_KEY?.trim() || `issue-${randomUUID()}`;
  const issueRes = await fetch(`${apiBaseUrl}/checkout/charges/${chargeId}/issue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": issueIdemKey,
    },
    body: JSON.stringify({ method: "PIX" }),
  });

  const issueJson = (await issueRes.json()) as unknown;
  if (!issueRes.ok) {
    throw new Error(`POST /checkout/charges/:id/issue failed (${issueRes.status}): ${JSON.stringify(issueJson)}`);
  }

  const issued = issueJson as IssueResponse;
  if (!issued.pix) {
    throw new Error("Issue response missing pix payload");
  }
  assertNonEmptyString(issued.pix.qrCode, "issued.pix.qrCode");
  assertNonEmptyString(issued.pix.copyPaste, "issued.pix.copyPaste");

  const getSessionRes = await fetch(`${apiBaseUrl}/checkout/sessions/${sessionId}`, {
    method: "GET",
  });

  const getSessionJson = (await getSessionRes.json()) as unknown;
  if (!getSessionRes.ok) {
    throw new Error(`GET /checkout/sessions/:id failed (${getSessionRes.status}): ${JSON.stringify(getSessionJson)}`);
  }

  const fetched = getSessionJson as GetSessionResponse;
  if (!fetched.pix) {
    throw new Error("Session response missing pix payload");
  }
  assertNonEmptyString(fetched.pix.qrCode, "session.pix.qrCode");
  assertNonEmptyString(fetched.pix.copyPaste, "session.pix.copyPaste");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBaseUrl,
        createIdemKey,
        issueIdemKey,
        sessionId,
        chargeId,
        amountCents,
        pix: {
          qrCodeLength: fetched.pix.qrCode.length,
          copyPasteLength: fetched.pix.copyPaste.length,
          expiresAt: fetched.pix.expiresAt,
        },
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
