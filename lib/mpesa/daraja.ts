import "server-only";

const SHORT_CODE = "174379";
const SANDBOX_URL = "https://sandbox.safaricom.co.ke";
const REQUEST_TIMEOUT_MS = 12_000;

type DarajaOutcome = "rejected" | "uncertain";

export class DarajaError extends Error {
  readonly outcome: DarajaOutcome;

  constructor(outcome: DarajaOutcome) {
    super("The M-Pesa request could not be completed.");
    this.name = "DarajaError";
    this.outcome = outcome;
  }
}

type DarajaTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

type DarajaStkResponse = {
  ResponseCode?: unknown;
  MerchantRequestID?: unknown;
  CheckoutRequestID?: unknown;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

export function isDarajaConfigured(): boolean {
  return Boolean(
    process.env.Key?.trim() &&
      process.env.Secret?.trim() &&
      process.env.Passkey_2?.trim(),
  );
}

export function getPublicAppOrigin(requestOrigin?: string | null): string | null {
  const candidates = process.env.NODE_ENV === "development"
    ? [
        requestOrigin,
        process.env.V0_RUNTIME_URL,
        process.env.V0_DEV_APP_URL,
        process.env.V0_BUILD_URL,
        process.env.V0_SANDBOX_URL,
        process.env.BETTER_AUTH_URL,
        process.env.VERCEL_URL,
      ]
    : [
        process.env.BETTER_AUTH_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL,
      ];

  for (const value of candidates) {
    if (!value) continue;
    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (url.protocol === "https:" && url.hostname !== "localhost") {
        return url.origin;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function timestampForNairobi(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const consumerKey = process.env.Key?.trim();
    const consumerSecret = process.env.Secret?.trim();
    if (!consumerKey || !consumerSecret) throw new DarajaError("rejected");

    let response: Response;
    try {
      response = await fetch(
        `${SANDBOX_URL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new DarajaError("rejected");
    }

    let body: DarajaTokenResponse | null = null;
    try {
      body = (await response.json()) as DarajaTokenResponse;
    } catch {
      throw new DarajaError("rejected");
    }

    if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
      throw new DarajaError("rejected");
    }

    const lifetime = Number(body.expires_in);
    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(60, Number.isFinite(lifetime) ? lifetime : 3600) * 1000 - 30_000,
    };
    return cachedToken.value;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

function stkPassword(timestamp: string): string {
  const passkey = process.env.Passkey_2?.trim();
  if (!passkey) throw new DarajaError("rejected");
  return Buffer.from(`${SHORT_CODE}${passkey}${timestamp}`).toString("base64");
}

export async function initiateStkPush(input: {
  phoneNumber: string;
  amount: number;
  callbackUrl: string;
  accountReference: string;
}): Promise<{ merchantRequestId: string; checkoutRequestId: string }> {
  const accessToken = await getAccessToken();
  const timestamp = timestampForNairobi();
  const payload = {
    BusinessShortCode: SHORT_CODE,
    Password: stkPassword(timestamp),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: input.amount,
    PartyA: input.phoneNumber,
    PartyB: SHORT_CODE,
    PhoneNumber: input.phoneNumber,
    CallBackURL: input.callbackUrl,
    AccountReference: input.accountReference,
    TransactionDesc: "Rent payment",
  };

  let response: Response;
  try {
    response = await fetch(`${SANDBOX_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DarajaError("uncertain");
  }

  let body: DarajaStkResponse | null = null;
  try {
    body = (await response.json()) as DarajaStkResponse;
  } catch {
    throw new DarajaError(response.status >= 500 ? "uncertain" : "rejected");
  }

  if (!response.ok) {
    throw new DarajaError(response.status >= 500 ? "uncertain" : "rejected");
  }
  if (String(body.ResponseCode ?? "") !== "0") {
    throw new DarajaError("rejected");
  }

  if (
    typeof body.MerchantRequestID !== "string" ||
    typeof body.CheckoutRequestID !== "string" ||
    !body.MerchantRequestID ||
    !body.CheckoutRequestID
  ) {
    throw new DarajaError("uncertain");
  }

  return {
    merchantRequestId: body.MerchantRequestID,
    checkoutRequestId: body.CheckoutRequestID,
  };
}

export async function queryStkPush(checkoutRequestId: string): Promise<{
  responseCode: string;
  resultCode: string;
}> {
  const accessToken = await getAccessToken();
  const timestamp = timestampForNairobi();
  const payload = {
    BusinessShortCode: SHORT_CODE,
    Password: stkPassword(timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  let response: Response;
  try {
    response = await fetch(`${SANDBOX_URL}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new DarajaError("uncertain");
  }

  let body: { ResponseCode?: unknown; ResultCode?: unknown } | null = null;
  try {
    body = await response.json();
  } catch {
    throw new DarajaError("uncertain");
  }

  if (!response.ok) throw new DarajaError("uncertain");
  return {
    responseCode: String(body?.ResponseCode ?? ""),
    resultCode: String(body?.ResultCode ?? ""),
  };
}
