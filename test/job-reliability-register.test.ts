import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 5 — S5.3: the job reliability register must stay complete. A cron route
 * that exists on disk but is missing from the register is exactly the job that
 * ships without a documented retry/terminal/owner story. This drift-guard fails
 * the build when a new `/api/cron/*` is added without a register row.
 */

const ROOT = process.cwd();
const register = readFileSync(join(ROOT, "docs/release/job-reliability-register.md"), "utf8");

const CRON_DIR = "app/api/cron";
const cronJobs = readdirSync(join(ROOT, CRON_DIR), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

describe("job reliability register: complete", () => {
  it("finds the cron jobs (guards against a silent empty scan)", () => {
    expect(cronJobs.length).toBeGreaterThanOrEqual(7);
  });

  it.each(cronJobs)("lists `%s` with its reliability story", (job) => {
    expect(register, `job-reliability-register.md omits "${job}"`).toContain(job);
  });

  it("records an explicit durable-queue / DLQ decision", () => {
    expect(register).toMatch(/durable[- ]queue/i);
    expect(register).toMatch(/Revisit when/i);
  });

  it("states an SLO and an owner line", () => {
    expect(register).toMatch(/SLO/);
    expect(register).toMatch(/Owner/i);
  });
});
