import { TASKS_EXTRACTION_STAGE } from "../src/boundary";

export default function TasksServicePage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
      <p style={{ color: "#8ea0c9", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Nevora product service
      </p>
      <h1 style={{ fontSize: 44, margin: "12px 0" }}>Tasks runtime</h1>
      <p style={{ color: "#b7c0d8", fontSize: 18, lineHeight: 1.6 }}>
        This independently built service verifies operation-bound identities
        and executes Tasks reads and mutations against Supabase locally.
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "10rem 1fr", gap: 12, marginTop: 36 }}>
        <dt style={{ color: "#8ea0c9" }}>Stage</dt>
        <dd style={{ margin: 0 }}>{TASKS_EXTRACTION_STAGE}</dd>
        <dt style={{ color: "#8ea0c9" }}>Health</dt>
        <dd style={{ margin: 0 }}>/api/health</dd>
        <dt style={{ color: "#8ea0c9" }}>Readiness</dt>
        <dd style={{ margin: 0 }}>/api/ready</dd>
      </dl>
    </main>
  );
}
