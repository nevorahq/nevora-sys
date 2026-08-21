import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TasksHttpOperation, TasksRequestContext } from "./index";

export const TASKS_SERVICE_TOKEN_ISSUER = "nevora-platform" as const;
export const TASKS_SERVICE_TOKEN_AUDIENCE = "nevora-tasks" as const;
export const TASKS_SERVICE_TOKEN_MAX_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;

const serviceClaimsSchema = z.object({
  version: z.literal(1),
  issuer: z.literal(TASKS_SERVICE_TOKEN_ISSUER),
  audience: z.literal(TASKS_SERVICE_TOKEN_AUDIENCE),
  subject: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  permissions: z.array(z.enum(["org.read", "data.write"])).max(2),
  operation: z.string().min(1),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().uuid(),
}).strict();

export type TasksServiceClaims = z.infer<typeof serviceClaimsSchema> & {
  operation: TasksHttpOperation;
};

export interface SignTasksServiceTokenInput {
  context: Readonly<TasksRequestContext>;
  operation: TasksHttpOperation;
  now?: number;
  ttlSeconds?: number;
  nonce?: string;
}

export type VerifyTasksServiceTokenResult =
  | { ok: true; claims: TasksServiceClaims }
  | { ok: false; reason: "misconfigured" | "malformed" | "invalid" | "expired" };

/** Create a short-lived, operation-bound service identity token. */
export function signTasksServiceToken(
  input: SignTasksServiceTokenInput,
  secret: string,
): string {
  assertSecret(secret);
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = input.ttlSeconds ?? 60;
  if (ttlSeconds < 1 || ttlSeconds > TASKS_SERVICE_TOKEN_MAX_TTL_SECONDS) {
    throw new Error(`Tasks service token TTL must be between 1 and ${TASKS_SERVICE_TOKEN_MAX_TTL_SECONDS} seconds.`);
  }

  const permissions = (["org.read", "data.write"] as const).filter((permission) =>
    input.context.permissions.includes(permission),
  );
  const claims: TasksServiceClaims = {
    version: 1,
    issuer: TASKS_SERVICE_TOKEN_ISSUER,
    audience: TASKS_SERVICE_TOKEN_AUDIENCE,
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
  return `nts1.${payload}.${signature}`;
}

/** Verify signature, expiry, TTL and operation binding before using claims. */
export function verifyTasksServiceToken(
  token: string,
  secret: string,
  expectedOperation: TasksHttpOperation,
  now = Math.floor(Date.now() / 1000),
): VerifyTasksServiceTokenResult {
  if (secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: "misconfigured" };
  if (token.length > 4_096) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "nts1" || !parts[1] || !parts[2]) {
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
    parsed.data.expiresAt - parsed.data.issuedAt > TASKS_SERVICE_TOKEN_MAX_TTL_SECONDS
  ) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims: parsed.data as TasksServiceClaims };
}

function signatureFor(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`nts1.${payload}`, "utf8").digest("base64url");
}

function assertSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`TASKS_SERVICE_AUTH_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
}
