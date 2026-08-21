import { once } from "node:events";
import { cp, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tasksBuild = resolve(repositoryRoot, "apps/tasks/.next");
const runtimeDirectory = resolve(tasksBuild, "standalone/apps/tasks");
const runtimeEntry = resolve(runtimeDirectory, "server.js");

export async function runTasksStandaloneSmoke() {
  await requireFile(runtimeEntry, "Run `npm run build:tasks` before the standalone smoke test.");
  await assembleStaticAssets();

  const port = await availablePort();
  const output = [];
  const child = spawn(process.execPath, [runtimeEntry], {
    cwd: runtimeDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      TASKS_SERVICE_AUTH_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => remember(output, chunk));
  child.stderr.on("data", (chunk) => remember(output, chunk));

  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(origin, child);

    const health = await readJson(`${origin}/api/health`);
    assert(health.response.status === 200, "health endpoint must return HTTP 200");
    assert(health.body.status === "ok", "health endpoint must report status=ok");

    const ready = await readJson(`${origin}/api/ready`);
    assert(ready.response.status === 503, "unconfigured readiness must return HTTP 503");
    assert(ready.body.status === "not_ready", "readiness must fail closed without secrets");

    const root = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
    const html = await root.text();
    assert(root.status === 200 && html.includes("Tasks runtime"), "service page must render");

    const staticAsset = extractStaticAsset(html);
    assert(staticAsset, "service page must reference a static asset");
    const assetResponse = await fetch(new URL(staticAsset, origin), {
      signal: AbortSignal.timeout(5_000),
    });
    assert(assetResponse.status === 200, "standalone runtime must serve copied static assets");

    const hidden = await fetch(`${origin}/api/internal/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "listTasks", input: {} }),
      signal: AbortSignal.timeout(5_000),
    });
    assert(hidden.status === 404, "internal endpoint must stay hidden without transport header");

    return {
      ok: true,
      checks: ["health", "readiness-fails-closed", "service-page", "static-assets", "rpc-hidden"],
    };
  } catch (error) {
    const diagnostics = output.join("").trim();
    if (diagnostics) error.message += `\nStandalone output:\n${diagnostics}`;
    throw error;
  } finally {
    await stop(child);
  }
}

async function assembleStaticAssets() {
  const source = resolve(tasksBuild, "static");
  const target = resolve(runtimeDirectory, ".next/static");
  await requireFile(source, "Tasks static build output is missing.");
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function requireFile(path, message) {
  try {
    await stat(path);
  } catch {
    throw new Error(message);
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
  if (!address || typeof address === "string") throw new Error("Could not allocate smoke-test port.");
  return address.port;
}

async function waitForHealth(origin, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Standalone Tasks process exited with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${origin}/api/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The server normally needs several polls before it accepts connections.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Standalone Tasks runtime did not become healthy within 20 seconds.");
}

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  return { response, body: await response.json() };
}

function extractStaticAsset(html) {
  return html.match(/["'](\/_next\/static\/[^"']+)["']/)?.[1] ?? null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Tasks standalone smoke failed: ${message}.`);
}

function remember(output, chunk) {
  if (output.join("").length < 20_000) output.push(String(chunk));
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runTasksStandaloneSmoke()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
