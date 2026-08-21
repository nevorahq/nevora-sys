import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SubscriptionsHttpOperation, SubscriptionsRequestContext } from "./index";

export const SUBSCRIPTIONS_SERVICE_TOKEN_ISSUER = "nevora-platform" as const;
export const SUBSCRIPTIONS_SERVICE_TOKEN_AUDIENCE = "nevora-subscriptions" as const;
export const SUBSCRIPTIONS_SERVICE_TOKEN_MAX_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;

const serviceClaimsSchema = z.object({
  version: z.literal(1),
  issuer: z.literal(SUBSCRIPTIONS_SERVICE_TOKEN_ISSUER),
  audience: z.literal(SUBSCRIPTIONS_SERVICE_TOKEN_AUDIENCE),
  subject: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  permissions: z.array(z.enum(["org.read", "data.write"])).max(2),
  operation: z.string().min(1),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().uuid(),
}).strict();

export type SubscriptionsServiceClaims = z.infer<typeof serviceClaimsSchema> & {
  operation: SubscriptionsHttpOperation;
};

export interface SignSubscriptionsServiceTokenInput {
  context: Readonly<SubscriptionsRequestContext>;
  operation: SubscriptionsHttpOperation;
  now?: number;
  ttlSeconds?: number;
  nonce?: string;
}

export type VerifySubscriptionsServiceTokenResult =
  | { ok: true; claims: SubscriptionsServiceClaims }
  | { ok: false; reason: "misconfigured" | "malformed" | "invalid" | "expired" };

/** Create a short-lived, operation-bound service identity token. */
export function signSubscriptionsServiceToken(
  input: SignSubscriptionsServiceTokenInput,
  secret: string,
): string {
  assertSecret(secret);
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = input.ttlSeconds ?? 60;
  if (ttlSeconds < 1 || ttlSeconds > SUBSCRIPTIONS_SERVICE_TOKEN_MAX_TTL_SECONDS) {
    throw new Error(`Subscriptions service token TTL must be between 1 and ${SUBSCRIPTIONS_SERVICE_TOKEN_MAX_TTL_SECONDS} seconds.`);
  }

  const permissions = (["org.read", "data.write"] as const).filter((permission) =>
    input.context.permissions.includes(permission),
  );
  const claims: SubscriptionsServiceClaims = {
    version: 1,
    issuer: SUBSCRIPTIONS_SERVICE_TOKEN_ISSUER,
    audience: SUBSCRIPTIONS_SERVICE_TOKEN_AUDIENCE,
    subject: input.context.actorId,
    organizationId: input.context.organizationId,
    workspaceId: input.context.workspaceId,
    permissions,
    operation: input.operation,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
    nonce: input.nonce ?? randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = signatureFor(payload, secret);
  return `nss1.${payload}.${signature}`;
}

/** Verify signature, expiry, TTL and operation binding before using claims. */
export function verifySubscriptionsServiceToken(
  token: string,
  secret: string,
  expectedOperation: SubscriptionsHttpOperation,
  now = Math.floor(Date.now() / 1000),
): VerifySubscriptionsServiceTokenResult {
  if (secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: "misconfigured" };
  if (token.length > 4_096) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "nss1" || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed" };
  }

  const expected = Buffer.from(signatureFor(parts[1], secret), "base64url");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { ok: false, reason: "invalid" };
  }

  let rawClaims: unknown;
  try {
    rawClaims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parsed = serviceClaimsSchema.safeParse(rawClaims);
  if (!parsed.success || parsed.data.operation !== expectedOperation) {
    return { ok: false, reason: "invalid" };
  }
  if (
    parsed.data.issuedAt > now + 30 ||
    parsed.data.expiresAt <= now ||
    parsed.data.expiresAt - parsed.data.issuedAt > SUBSCRIPTIONS_SERVICE_TOKEN_MAX_TTL_SECONDS
  ) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims: parsed.data as SubscriptionsServiceClaims };
}

function signatureFor(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`nss1.${payload}`, "utf8").digest("base64url");
}

function assertSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SUBSCRIPTIONS_SERVICE_AUTH_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
}
