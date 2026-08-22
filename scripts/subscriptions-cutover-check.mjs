import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const TRANSPORT_HEADER = "x-nevora-subscriptions-transport";
const TRANSPORT_VERSION = "subscriptions-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runSubscriptionsCutoverCheck({
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
  const config = readConfig(environment);
  const checks = [];

  checks.push(await checkHealth(fetchImplementation, config.targetUrl, config.expectedStage));
  checks.push(await checkReadiness(fetchImplementation, config.targetUrl));

  const targetResult = await readSubscriptions(fetchImplementation, config.targetUrl, config);
  checks.push({ name: "target-rpc", ok: true, count: targetResult.length });

  if (config.sourceUrl) {
    const sourceResult = await readSubscriptions(fetchImplementation, config.sourceUrl, config);
    const matched = canonicalJson(sourceResult) === canonicalJson(targetResult);
    checks.push({
      name: "source-target-parity",
      ok: matched,
      sourceCount: sourceResult.length,
      targetCount: targetResult.length,
    });
    if (!matched) throw new Error("Subscriptions source/target read parity mismatch.");
  }

  return { ok: true, target: config.targetUrl, checks };
}

function readConfig(environment) {
  const targetUrl = required(environment.SUBSCRIPTIONS_API_URL, "SUBSCRIPTIONS_API_URL");
  const secret = required(environment.SUBSCRIPTIONS_SERVICE_AUTH_SECRET, "SUBSCRIPTIONS_SERVICE_AUTH_SECRET");
  if (secret.length < 32) throw new Error("SUBSCRIPTIONS_SERVICE_AUTH_SECRET must contain 32+ characters.");
  const organizationId = requiredUuid(
    environment.SUBSCRIPTIONS_CANARY_ORGANIZATION_ID,
    "SUBSCRIPTIONS_CANARY_ORGANIZATION_ID",
  );
  const workspaceId = requiredUuid(
    environment.SUBSCRIPTIONS_CANARY_WORKSPACE_ID,
    "SUBSCRIPTIONS_CANARY_WORKSPACE_ID",
  );
  const actorId = requiredUuid(environment.SUBSCRIPTIONS_CANARY_ACTOR_ID, "SUBSCRIPTIONS_CANARY_ACTOR_ID");
  return {
    targetUrl: normalizeOrigin(targetUrl),
    sourceUrl: environment.SUBSCRIPTIONS_CANARY_SOURCE_URL
      ? normalizeOrigin(environment.SUBSCRIPTIONS_CANARY_SOURCE_URL)
      : null,
    secret,
    organizationId,
    workspaceId,
    actorId,
    expectedStage: environment.SUBSCRIPTIONS_CANARY_EXPECTED_STAGE?.trim()
      || "standalone_runtime_ready",
  };
}

async function checkHealth(fetchImplementation, origin, expectedStage) {
  const response = await request(fetchImplementation, new URL("/api/health", origin), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`/api/health returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body.status !== "ok" || body.service !== "subscriptions" || body.stage !== expectedStage) {
    throw new Error("Subscriptions health identity does not match the expected runtime stage.");
  }
  return { name: "health", ok: true, status: response.status, stage: body.stage };
}

async function checkReadiness(fetchImplementation, origin) {
  const response = await request(fetchImplementation, new URL("/api/ready", origin), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`/api/ready returned HTTP ${response.status}.`);
  const body = await response.json();
  if (
    body.status !== "ready"
    || body.service !== "subscriptions"
    || body.databaseConfigured !== true
    || body.databaseConnected !== true
    || body.serviceIdentityConfigured !== true
  ) {
    throw new Error("Subscriptions readiness endpoint is not ready.");
  }
  return { name: "ready", ok: true, status: response.status };
}

async function readSubscriptions(fetchImplementation, origin, config) {
  const operation = "getSubscriptions";
  const token = signToken(config, operation);
  const response = await request(
    fetchImplementation,
    new URL("/api/internal/subscriptions", origin),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TRANSPORT_HEADER]: TRANSPORT_VERSION,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ operation, input: {} }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body?.ok || !Array.isArray(body.data)) {
    throw new Error(`Subscriptions RPC check failed at ${origin} (HTTP ${response.status}).`);
  }
  return body.data;
}

function signToken(config, operation) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    version: 1,
    issuer: "nevora-platform",
    audience: "nevora-subscriptions",
    subject: config.actorId,
    organizationId: config.organizationId,
    workspaceId: config.workspaceId,
    permissions: ["org.read"],
    operation,
    issuedAt,
    expiresAt: issuedAt + 60,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", config.secret)
    .update(`nss1.${payload}`, "utf8")
    .digest("base64url");
  return `nss1.${payload}.${signature}`;
}

async function request(fetchImplementation, url, init) {
  try {
    return await fetchImplementation(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`Subscriptions canary request failed for ${url.origin}: ${errorMessage(error)}`);
  }
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Subscriptions canary URLs must use http or https.");
  }
  return url.origin;
}

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function requiredUuid(value, name) {
  const normalized = required(value, name);
  if (!UUID.test(normalized)) throw new Error(`${name} must be a UUID.`);
  return normalized;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (invokedDirectly) {
  runSubscriptionsCutoverCheck()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(`Subscriptions cutover check failed: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
