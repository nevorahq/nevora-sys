import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ORGANIZATION_ID = "96000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "97000000-0000-4000-8000-000000000001";
const ACTOR_ID = "95000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_ID = "99000000-0000-4000-8000-000000000001";
const TASKS_SERVICE_SECRET = "local-tasks-rehearsal-secret-000000000000";
const SUBSCRIPTIONS_SERVICE_SECRET = "local-subscriptions-rehearsal-secret-00000";

/**
 * Exercises the one path unique to Subscriptions among the three products:
 * a genuinely separate deployment with NO in-process fallback, calling a
 * second live service (Tasks) over HTTP to provision a payment task. Both
 * containers run together against the same local Supabase and the same
 * rehearsal tenant — this is the only rehearsal script that needs two
 * services, because it's the only cross-product write path left after the
 * Money obligation bridge was removed.
 */
export async function runSubscriptionsLocalRehearsal({
  tasksImage = process.env.TASKS_REHEARSAL_IMAGE || "nevora-tasks:local",
  subscriptionsImage = process.env.SUBSCRIPTIONS_REHEARSAL_IMAGE || "nevora-subscriptions:local",
} = {}) {
  const local = await readSupabaseStatus();
  const tasksContainer = `nevora-tasks-rehearsal-${process.pid}`;
  const subscriptionsContainer = `nevora-subscriptions-rehearsal-${process.pid}`;
  const tasksPort = await availablePort();
  const subscriptionsPort = await availablePort();
  let tasksStarted = false;
  let subscriptionsStarted = false;
  let cycleId = null;
  let taskId = null;

  await execute("docker", ["image", "inspect", tasksImage], { cwd: repositoryRoot });
  await execute("docker", ["image", "inspect", subscriptionsImage], { cwd: repositoryRoot });
  await applySql(local.dbUrl, "supabase/migrations/114_tasks_service_usage_rpc.sql");
  await applySql(local.dbUrl, "scripts/db/tasks-rehearsal-local-service-role.sql");
  await verifyLocalServiceRole(local);
  await applySql(local.dbUrl, "scripts/db/subscriptions-rehearsal-seed.sql");

  try {
    await execute("docker", [
      "run", "--detach", "--rm",
      "--name", tasksContainer,
      "--add-host", "host.docker.internal:host-gateway",
      "--publish", `127.0.0.1:${tasksPort}:3001`,
      "--env", "SUPABASE_URL=http://host.docker.internal:54321",
      "--env", `SUPABASE_SERVICE_ROLE_KEY=${local.serviceRoleKey}`,
      "--env", `TASKS_SERVICE_AUTH_SECRET=${TASKS_SERVICE_SECRET}`,
      tasksImage,
    ], { cwd: repositoryRoot });
    tasksStarted = true;
    await waitForReadiness(`http://127.0.0.1:${tasksPort}`, tasksContainer);

    await execute("docker", [
      "run", "--detach", "--rm",
      "--name", subscriptionsContainer,
      "--add-host", "host.docker.internal:host-gateway",
      "--publish", `127.0.0.1:${subscriptionsPort}:3002`,
      "--env", "SUPABASE_URL=http://host.docker.internal:54321",
      "--env", `SUPABASE_SERVICE_ROLE_KEY=${local.serviceRoleKey}`,
      "--env", `SUBSCRIPTIONS_SERVICE_AUTH_SECRET=${SUBSCRIPTIONS_SERVICE_SECRET}`,
      // The point of this rehearsal: Subscriptions reaches Tasks over the
      // Docker bridge, not localhost — proving the cross-service call works
      // the same way it will between two real deployments.
      "--env", `TASKS_API_URL=http://host.docker.internal:${tasksPort}`,
      "--env", `TASKS_SERVICE_AUTH_SECRET=${TASKS_SERVICE_SECRET}`,
      subscriptionsImage,
    ], { cwd: repositoryRoot });
    subscriptionsStarted = true;

    const subscriptionsOrigin = `http://127.0.0.1:${subscriptionsPort}`;
    await waitForReadiness(subscriptionsOrigin, subscriptionsContainer);

    const subscription = {
      id: SUBSCRIPTION_ID,
      name: "Subscriptions runtime rehearsal",
      amount: 9.99,
      currency: "USD",
      billing_cycle: "monthly",
      billing_anchor_day: new Date().getUTCDate(),
      next_billing_date: isoDate(new Date()),
      default_category_id: null,
      auto_task_enabled: true,
      is_active: true,
      cancelled_at: null,
      workspace_id: WORKSPACE_ID,
    };

    const cycleResult = await rpc(subscriptionsOrigin, "createSubscriptionPaymentCycle", {
      subscription,
      dueDate: subscription.next_billing_date,
    });
    assert(cycleResult.ok === true, "creating the payment cycle must succeed");
    assert(cycleResult.cycle?.status === "planned", "a fresh cycle must start planned");
    cycleId = cycleResult.cycle.id;

    const replayCycle = await rpc(subscriptionsOrigin, "createSubscriptionPaymentCycle", {
      subscription,
      dueDate: subscription.next_billing_date,
    });
    assert(replayCycle.ok === true && replayCycle.created === false,
      "replaying the same billing period must be idempotent");
    assert(replayCycle.cycle.id === cycleId, "idempotent replay must return the original cycle");

    // The operation unique to this rehearsal: Subscriptions, over HTTP, asks
    // Tasks — a SEPARATE container — to create the payment task. No local
    // fallback exists; if this succeeds, the cross-service path is real.
    const taskResult = await rpc(subscriptionsOrigin, "createSubscriptionPaymentTaskForCycle", {
      subscription: {
        id: subscription.id,
        name: subscription.name,
        auto_task_enabled: subscription.auto_task_enabled,
        workspace_id: subscription.workspace_id,
      },
      cycle: cycleResult.cycle,
    });
    assert(taskResult.ok === true, "provisioning the payment task via Tasks must succeed");
    assert(typeof taskResult.taskId === "string", "the Tasks service must return a task id");
    taskId = taskResult.taskId;

    // Verify directly against Postgres that the task genuinely landed in
    // Tasks-owned `todos`, not merely that Subscriptions believed it did.
    const createdTask = await fetchTask(local, taskId);
    assert(createdTask !== null, "the task Tasks reported creating must actually exist in todos");
    assert(createdTask.organization_id === ORGANIZATION_ID, "the task must be scoped to the rehearsal org");

    const cycleAfterTask = await fetchCycle(local, cycleId);
    assert(cycleAfterTask.task_id === taskId, "the cycle must be linked to the task Tasks created");
    assert(cycleAfterTask.status === "task_open", "the cycle must advance to task_open once a task exists");

    return {
      ok: true,
      tasksImage,
      subscriptionsImage,
      checks: [
        "migration-114",
        "database-readiness",
        "cycle-create",
        "cycle-idempotent-replay",
        "cross-service-task-create",
        "task-lands-in-tasks-owned-todos",
        "cycle-linked-to-task",
      ],
    };
  } finally {
    if (taskId) await deleteTask(local, taskId).catch(() => undefined);
    if (cycleId) await deleteCycle(local, cycleId).catch(() => undefined);
    if (subscriptionsStarted) {
      await execute("docker", ["stop", "--time", "5", subscriptionsContainer]).catch(() => undefined);
    }
    if (tasksStarted) {
      await execute("docker", ["stop", "--time", "5", tasksContainer]).catch(() => undefined);
    }
    await applySql(local.dbUrl, "scripts/db/subscriptions-rehearsal-cleanup.sql");
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
  const serviceRoleKey = values.SECRET_KEY || values.SERVICE_ROLE_KEY;
  if (!dbUrl || !apiUrl || !serviceRoleKey) {
    throw new Error("Local Supabase is not running. Start it with `supabase start`.");
  }
  return { dbUrl, apiUrl, serviceRoleKey };
}

async function applySql(dbUrl, path) {
  await execute("psql", [
    dbUrl,
    "--set", "ON_ERROR_STOP=1",
    "--file", resolve(repositoryRoot, path),
  ], { cwd: repositoryRoot });
}

async function rpc(origin, operation, input) {
  const response = await fetch(`${origin}/api/internal/subscriptions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nevora-subscriptions-transport": "subscriptions-v1",
      authorization: `Bearer ${signSubscriptionsToken(operation)}`,
    },
    body: JSON.stringify({ operation, input }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true) {
    throw new Error(`Subscriptions RPC ${operation} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

function signSubscriptionsToken(operation) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    version: 1,
    issuer: "nevora-platform",
    audience: "nevora-subscriptions",
    subject: ACTOR_ID,
    organizationId: ORGANIZATION_ID,
    workspaceId: WORKSPACE_ID,
    permissions: ["org.read", "data.write"],
    operation,
    issuedAt,
    expiresAt: issuedAt + 60,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", SUBSCRIPTIONS_SERVICE_SECRET)
    .update(`nss1.${payload}`, "utf8")
    .digest("base64url");
  return `nss1.${payload}.${signature}`;
}

async function fetchTask(local, taskId) {
  const url = new URL("/rest/v1/todos", local.apiUrl);
  url.searchParams.set("select", "id,organization_id,title,status");
  url.searchParams.set("id", `eq.${taskId}`);
  const response = await serviceRequest(local, url);
  const rows = await response.json();
  return rows[0] ?? null;
}

async function fetchCycle(local, cycleId) {
  const url = new URL("/rest/v1/subscription_payment_cycles", local.apiUrl);
  url.searchParams.set("select", "id,task_id,status");
  url.searchParams.set("id", `eq.${cycleId}`);
  const response = await serviceRequest(local, url);
  const rows = await response.json();
  if (!rows.length) throw new Error(`Rehearsal cycle ${cycleId} vanished mid-run.`);
  return rows[0];
}

async function deleteTask(local, taskId) {
  const url = new URL("/rest/v1/todos", local.apiUrl);
  url.searchParams.set("id", `eq.${taskId}`);
  const response = await serviceRequest(local, url, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clean rehearsal task (HTTP ${response.status}).`);
}

async function deleteCycle(local, cycleId) {
  const url = new URL("/rest/v1/subscription_payment_cycles", local.apiUrl);
  url.searchParams.set("id", `eq.${cycleId}`);
  const response = await serviceRequest(local, url, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clean rehearsal cycle (HTTP ${response.status}).`);
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
        `Container ${containerName} did not become ready (${lastResponse}).\n${stdout}${stderr}`,
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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Subscriptions local rehearsal failed: ${message}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runSubscriptionsLocalRehearsal()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
