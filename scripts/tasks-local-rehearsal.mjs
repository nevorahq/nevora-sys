import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORGANIZATION_ID = "92000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "93000000-0000-4000-8000-000000000001";
const ACTOR_ID = "91000000-0000-4000-8000-000000000001";
const SERVICE_SECRET = "local-tasks-rehearsal-secret-000000000000";

export async function runTasksLocalRehearsal({
  image = process.env.TASKS_REHEARSAL_IMAGE || "nevora-tasks:local",
} = {}) {
  const local = await readSupabaseStatus();
  const containerName = `nevora-tasks-rehearsal-${process.pid}`;
  const port = await availablePort();
  let containerStarted = false;
  let taskId = null;

  await execute("docker", ["image", "inspect", image], { cwd: repositoryRoot });
  await applySql(local.dbUrl, "supabase/migrations/114_tasks_service_usage_rpc.sql");
  await applySql(local.dbUrl, "scripts/db/tasks-rehearsal-local-service-role.sql");
  await verifyLocalServiceRole(local);
  await applySql(local.dbUrl, "scripts/db/tasks-rehearsal-seed.sql");

  try {
    await execute("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--add-host",
      "host.docker.internal:host-gateway",
      "--publish",
      `127.0.0.1:${port}:3001`,
      "--env",
      "SUPABASE_URL=http://host.docker.internal:54321",
      "--env",
      `SUPABASE_SERVICE_ROLE_KEY=${local.serviceRoleKey}`,
      "--env",
      `TASKS_SERVICE_AUTH_SECRET=${SERVICE_SECRET}`,
      image,
    ], { cwd: repositoryRoot });
    containerStarted = true;

    const origin = `http://127.0.0.1:${port}`;
    await waitForReadiness(origin, containerName);

    const sourceSuggestionId = randomUUID();
    const title = `Tasks runtime rehearsal ${sourceSuggestionId}`;
    const input = { title, sourceSuggestionId };
    const first = await rpc(origin, "createStandardTask", input, ["org.read", "data.write"]);
    assert(first.ok === true && first.created === true, "first write must create a task");
    assert(typeof first.taskId === "string", "first write must return a task id");
    taskId = first.taskId;

    const replay = await rpc(origin, "createStandardTask", input, ["org.read", "data.write"]);
    assert(replay.ok === true && replay.created === false, "replayed source must be idempotent");
    assert(replay.taskId === taskId, "idempotent replay must return the original task id");

    const task = await rpc(origin, "getTask", { taskId }, ["org.read"]);
    assert(task?.id === taskId && task.title === title, "signed task read must return the write");

    const listed = await rpc(origin, "listTasks", { limit: 20 }, ["org.read"]);
    assert(Array.isArray(listed) && listed.some((entry) => entry.id === taskId),
      "signed list must contain the created task");

    const reserved = await usageValue(local, 1);
    assert(reserved === 1, "idempotent replay must reserve tasks.count exactly once");

    await deleteTask(local, taskId);
    taskId = null;
    const released = await usageValue(local, 0);
    assert(released === 0, "task cleanup must release tasks.count");

    return {
      ok: true,
      image,
      checks: [
        "migration-114",
        "database-readiness",
        "signed-write",
        "idempotent-replay",
        "signed-read",
        "signed-list",
        "usage-reservation-release",
      ],
    };
  } finally {
    if (taskId) await deleteTask(local, taskId).catch(() => undefined);
    if (containerStarted) {
      await execute("docker", ["stop", "--time", "5", containerName]).catch(() => undefined);
    }
    await applySql(local.dbUrl, "scripts/db/tasks-rehearsal-cleanup.sql");
  }
}

async function verifyLocalServiceRole(local) {
  const url = new URL("/rest/v1/organizations", local.apiUrl);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  const response = await serviceRequest(local, url);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Local Supabase service-role preflight failed (HTTP ${response.status}): ${detail}`,
    );
  }
}

async function readSupabaseStatus() {
  const { stdout } = await execute("supabase", ["status", "--output", "env"], {
    cwd: repositoryRoot,
  });
  const values = Object.fromEntries(
    stdout.split("\n").flatMap((line) => {
      const match = line.match(/^([A-Z_]+)="(.*)"$/);
      return match ? [[match[1], match[2]]] : [];
    }),
  );
  const dbUrl = values.DB_URL;
  const apiUrl = values.API_URL;
  // Newer local Supabase stacks expose an `sb_secret_...` key alongside the
  // legacy JWT. Prefer it because the gateway maps it to the hosted-like
  // service role even when an old local snapshot lacks direct table grants.
  const serviceRoleKey = values.SECRET_KEY || values.SERVICE_ROLE_KEY;
  if (!dbUrl || !apiUrl || !serviceRoleKey) {
    throw new Error("Local Supabase is not running. Start it with `supabase start`.");
  }
  return { dbUrl, apiUrl, serviceRoleKey };
}

async function applySql(dbUrl, path) {
  await execute("psql", [
    dbUrl,
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    resolve(repositoryRoot, path),
  ], { cwd: repositoryRoot });
}

async function rpc(origin, operation, input, permissions) {
  const response = await fetch(`${origin}/api/internal/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nevora-tasks-transport": "tasks-v1",
      authorization: `Bearer ${signToken(operation, permissions)}`,
    },
    body: JSON.stringify({ operation, input }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true) {
    throw new Error(`Tasks RPC ${operation} failed with HTTP ${response.status}.`);
  }
  return body.data;
}

function signToken(operation, permissions) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    version: 1,
    issuer: "nevora-platform",
    audience: "nevora-tasks",
    subject: ACTOR_ID,
    organizationId: ORGANIZATION_ID,
    workspaceId: WORKSPACE_ID,
    permissions,
    operation,
    issuedAt,
    expiresAt: issuedAt + 60,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", SERVICE_SECRET)
    .update(`nts1.${payload}`, "utf8")
    .digest("base64url");
  return `nts1.${payload}.${signature}`;
}

async function usageValue(local, fallback) {
  const url = new URL("/rest/v1/organization_usage_counters", local.apiUrl);
  url.searchParams.set("select", "value");
  url.searchParams.set("organization_id", `eq.${ORGANIZATION_ID}`);
  url.searchParams.set("key", "eq.tasks.count");
  const response = await serviceRequest(local, url);
  const rows = await response.json();
  return rows.length ? Number(rows[0].value) : fallback;
}

async function deleteTask(local, taskId) {
  const url = new URL("/rest/v1/todos", local.apiUrl);
  url.searchParams.set("id", `eq.${taskId}`);
  const response = await serviceRequest(local, url, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clean rehearsal task (HTTP ${response.status}).`);
}

async function serviceRequest(local, url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      apikey: local.serviceRoleKey,
      authorization: `Bearer ${local.serviceRoleKey}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

async function waitForReadiness(origin, containerName) {
  let lastResponse = "no response";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/ready`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastResponse = `HTTP ${response.status}: ${await response.text()}`;
    } catch {
      // Startup polling is expected to fail until the container accepts traffic.
    }
    if (attempt === 30) {
      const { stdout, stderr } = await execute("docker", ["logs", containerName]);
      throw new Error(
        `Tasks container did not become ready (${lastResponse}).\n${stdout}${stderr}`,
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
}

async function availablePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => {
    if (error) reject(error);
    else resolveClose();
  }));
  if (!address || typeof address === "string") throw new Error("Could not allocate rehearsal port.");
  return address.port;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Tasks local rehearsal failed: ${message}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runTasksLocalRehearsal()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
