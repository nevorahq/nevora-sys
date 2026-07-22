import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Analytics & event privacy invariants (Sprint 6 — S6.2), enforcing
 * `docs/contracts/analytics-privacy.md`: an event/metric payload measures
 * outcomes, never secrets. The failure mode is a NEW `payload: { … }` that leaks
 * document contents, a raw email, or an unredacted filename — visible in source.
 *
 * We scan the flat `payload:` / `newData:` object literals specifically (not DB
 * `.insert({ … })` writes): the real filename belongs in `document_attachments`,
 * but never in a `domain_events` payload.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

/** Files that emit a domain event or an audit log. */
const EVENT_FILES = [...walk("modules"), ...walk("app"), ...walk("lib")]
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .filter((f) => /emit(DomainEvent|AuditLog)\(/.test(read(f)));

/** Flat `payload: { … }` / `newData: { … }` object literals (event telemetry). */
function payloadBlocks(src: string): string[] {
  return [...src.matchAll(/\b(?:payload|newData)\s*:\s*\{[^{}]*\}/g)].map((m) => m[0]);
}

const CONTENT_KEYS = /\b(raw_text|ocr_text|extracted_text|document_content|raw_json)\s*:/;

describe("analytics privacy: the event surface exists", () => {
  it("finds event-emitting files (guards against a silent empty scan)", () => {
    expect(EVENT_FILES.length).toBeGreaterThanOrEqual(10);
  });

  it("finds payload blocks to inspect", () => {
    const total = EVENT_FILES.reduce((n, f) => n + payloadBlocks(read(f)).length, 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });
});

describe("analytics privacy: no secrets in event payloads", () => {
  it.each(EVENT_FILES)("%s: payloads carry no document content", (file) => {
    for (const block of payloadBlocks(read(file))) {
      expect(block, `${file} leaks document content in an event payload`).not.toMatch(CONTENT_KEYS);
    }
  });

  it.each(EVENT_FILES)("%s: any filename in a payload is redacted", (file) => {
    for (const block of payloadBlocks(read(file))) {
      if (/\b(filename|file_name)\s*:/.test(block)) {
        expect(block, `${file} puts a raw filename in an event payload`).toContain("redactFilenameForEvent");
      }
    }
  });

  it.each(EVENT_FILES)("%s: any email in a payload is masked", (file) => {
    for (const block of payloadBlocks(read(file))) {
      if (/\bemail\s*:/.test(block)) {
        expect(block, `${file} puts a raw email in an event payload`).toContain("maskEmail");
      }
    }
  });
});

describe("analytics privacy: activation metrics are aggregate-only", () => {
  const metrics = read("modules/onboarding/services/activation-metrics.ts");

  it("the funnel output carries no identity field", () => {
    // Output shape references only counts / rates / durations, never raw identity.
    expect(metrics).not.toMatch(/\bemail\b/);
    expect(metrics).not.toMatch(/\braw_text\b/);
    expect(metrics).not.toMatch(/\buser_email\b/);
  });

  it("the funnel endpoint is METRICS_SECRET-gated and fail-closed", () => {
    const route = read("app/api/internal/activation-funnel/route.ts");
    expect(route).toContain("METRICS_SECRET");
    expect(route).toMatch(/401|403|503/);
  });
});
