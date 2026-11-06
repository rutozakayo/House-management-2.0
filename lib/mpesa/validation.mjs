import { createHmac, timingSafeEqual } from "node:crypto";

const CALLBACK_STATE_TTL_MS = 12 * 60 * 60 * 1000;

export function isAllowedRequestOrigin(origin, allowedOrigins) {
  if (typeof origin !== "string" || origin === "null") return false;

  function normalize(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const candidate = value.includes("://") ? value : `https://${value}`;
      const url = new URL(candidate);
      return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
    } catch {
      return null;
    }
  }

  const requestOrigin = normalize(origin);
  return Boolean(
    requestOrigin &&
      Array.isArray(allowedOrigins) &&
      allowedOrigins.some((allowed) => normalize(allowed) === requestOrigin),
  );
}

export function normalizeMpesaPhone(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;

  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.length === 9 && /^[17]/.test(digits)) {
    digits = `254${digits}`;
  }

  return /^254[17]\d{8}$/.test(digits) ? digits : null;
}

export function validateStkPushInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "body" };
  }

  const amount = input.amount;
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 2_147_483_647
  ) {
    return { ok: false, code: "amount" };
  }

  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, code: "month" };
  }

  const houseId = typeof input.houseId === "string" ? input.houseId.trim() : "";
  const houseLabel = typeof input.houseLabel === "string" ? input.houseLabel.trim() : "";
  if (!houseId || houseId.length > 100 || !houseLabel || houseLabel.length > 80) {
    return { ok: false, code: "house" };
  }

  if (String(input.currency ?? "").trim().toUpperCase() !== "KES") {
    return { ok: false, code: "currency" };
  }

  const phoneNumber = normalizeMpesaPhone(input.phoneNumber);
  if (!phoneNumber) return { ok: false, code: "phone" };

  return {
    ok: true,
    value: { amount, month, houseId, houseLabel, phoneNumber, currency: "KES" },
  };
}

export function resolveIdempotencyAction(existing, input) {
  if (!existing) return "create";
  const sameRequest =
    existing.houseId === input.houseId &&
    existing.month === input.month &&
    existing.amount === input.amount &&
    existing.phoneNumber === input.phoneNumber;
  return sameRequest ? "reuse" : "conflict";
}

export function signCallbackState(paymentId, userId, secret, now = Date.now()) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("A signing secret of at least 32 characters is required.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      paymentId: String(paymentId),
      userId: String(userId),
      expiresAt: now + CALLBACK_STATE_TTL_MS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCallbackState(state, secret, now = Date.now()) {
  if (
    typeof state !== "string" ||
    state.length > 2048 ||
    typeof secret !== "string" ||
    secret.length < 32
  ) {
    return null;
  }

  const separator = state.lastIndexOf(".");
  if (separator < 1 || separator === state.length - 1) return null;

  const payload = state.slice(0, separator);
  const receivedSignature = Buffer.from(state.slice(separator + 1), "base64url");
  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      data.version !== 1 ||
      typeof data.paymentId !== "string" ||
      typeof data.userId !== "string" ||
      !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt < now ||
      data.expiresAt > now + CALLBACK_STATE_TTL_MS
    ) {
      return null;
    }

    return {
      paymentId: data.paymentId,
      userId: data.userId,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}

export function isCallbackCorrelated(payment, checkoutRequestId) {
  return Boolean(
    payment &&
      typeof checkoutRequestId === "string" &&
      checkoutRequestId.length > 0 &&
      payment.checkoutRequestId === checkoutRequestId,
  );
}

export function isTerminalPaymentStatus(status) {
  return status === "succeeded" || status === "failed";
}
