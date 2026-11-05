import assert from "node:assert/strict";
import {
  isAllowedRequestOrigin,
  isCallbackCorrelated,
  isTerminalPaymentStatus,
  normalizeMpesaPhone,
  resolveIdempotencyAction,
  signCallbackState,
  validateStkPushInput,
  verifyCallbackState,
} from "../lib/mpesa/validation.mjs";

const input = {
  houseId: "house-1",
  houseLabel: "House 1",
  month: "2026-11",
  amount: 12500,
  phoneNumber: "+254 712 345 678",
  currency: "KES",
};
const valid = validateStkPushInput(input);
assert.equal(valid.ok, true);
assert.equal(valid.value.phoneNumber, "254712345678");
assert.equal(isAllowedRequestOrigin("https://rent.example.com", ["https://rent.example.com/"]), true);
assert.equal(isAllowedRequestOrigin("http://localhost:8080", ["http://localhost:8080"]), true);
assert.equal(isAllowedRequestOrigin("https://rent.example.com.attacker.test", ["https://rent.example.com"]), false);
assert.equal(isAllowedRequestOrigin("null", ["https://rent.example.com"]), false);
assert.equal(isAllowedRequestOrigin(null, ["https://rent.example.com"]), false);
assert.equal(normalizeMpesaPhone("0712 345 678"), "254712345678");
assert.equal(normalizeMpesaPhone("00254 112 345 678"), "254112345678");
assert.equal(normalizeMpesaPhone("0771 234 567"), "254771234567");
assert.equal(normalizeMpesaPhone("256 771 234 567"), null);
assert.equal(normalizeMpesaPhone("25471234"), null);

assert.equal(validateStkPushInput({ ...input, amount: 12500.5 }).code, "amount");
assert.equal(validateStkPushInput({ ...input, amount: 0 }).code, "amount");
assert.equal(validateStkPushInput({ ...input, currency: "UGX" }).code, "currency");
assert.equal(validateStkPushInput({ ...input, month: "2026-13" }).code, "month");
assert.equal(validateStkPushInput({ ...input, phoneNumber: "256700000000" }).code, "phone");

const existing = {
  houseId: "house-1",
  month: "2026-11",
  amount: 12500,
  phoneNumber: "254712345678",
};
assert.equal(resolveIdempotencyAction(null, valid.value), "create");
assert.equal(resolveIdempotencyAction(existing, valid.value), "reuse");
assert.equal(resolveIdempotencyAction(existing, { ...valid.value, amount: 12501 }), "conflict");

const secret = "test-only-secret-0123456789012345";
const now = Date.UTC(2026, 10, 6, 12, 0, 0);
const token = signCallbackState("payment-1", "owner-1", secret, now);
assert.deepEqual(verifyCallbackState(token, secret, now + 1000), {
  paymentId: "payment-1",
  userId: "owner-1",
  expiresAt: now + 12 * 60 * 60 * 1000,
});
assert.equal(verifyCallbackState(token, "different-secret-012345678901234", now), null);
assert.equal(verifyCallbackState(token, secret, now + 13 * 60 * 60 * 1000), null);
const [payload, signature] = token.split(".");
const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
assert.equal(verifyCallbackState(`${payload}.${alteredSignature}`, secret, now), null);

assert.equal(isCallbackCorrelated({ checkoutRequestId: "ws-1" }, "ws-1"), true);
assert.equal(isCallbackCorrelated({ checkoutRequestId: "ws-1" }, "ws-2"), false);
assert.equal(isCallbackCorrelated({ checkoutRequestId: null }, "ws-1"), false);
assert.equal(isCallbackCorrelated(null, "ws-1"), false);
assert.equal(isTerminalPaymentStatus("succeeded"), true);
assert.equal(isTerminalPaymentStatus("failed"), true);
assert.equal(isTerminalPaymentStatus("pending"), false);

console.log("mpesa: PASS — phone, amount/currency, idempotency, callback signature and correlation");
