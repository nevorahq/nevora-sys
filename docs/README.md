# Documentation

Everything in this folder describes the product **as it is on `main`**, except
[`archive/`](./archive/), which keeps dated reports and superseded plans for
history. When a change makes a doc here untrue, fix the doc in the same PR.

## Start here

| Doc | What it answers |
| --- | --- |
| [`MODULE_STATUS.md`](./MODULE_STATUS.md) | What each module can do today, and what is missing |
| [`ROADMAP.md`](./ROADMAP.md) | Where we are, what is next, what shipped |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the system is built and the hard rules |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Running, verifying and extending the code |
| [`SECURITY.md`](./SECURITY.md) | Per-change checklist, tenant isolation, machine-facing surfaces |
| [`OPERATIONS_MANUAL.md`](./OPERATIONS_MANUAL.md) | Operator's index during an incident |
| [`PRODUCT_COPY.md`](./PRODUCT_COPY.md) | Positioning and what the copy may promise |

## Decisions and contracts

- [`adr/`](./adr/) — product module boundaries (001), multichannel capture (002).
- [`contracts/`](./contracts/) — normative, several pinned by tests:
  financial workflows and states, attention model, notifications, AI governance,
  analytics privacy, billing lifecycle, domain events, the Tasks server API.
- [`CAPTURE_INBOX_CONTRACTS.md`](./CAPTURE_INBOX_CONTRACTS.md) — the Inbox pipeline every channel ends in.

## Running production

- [`runbooks/`](./runbooks/) — rollback, cron failure, stuck extraction, tenant
  leak, billing and usage drift, product cutovers.
- [`release/`](./release/) — release and smoke checklists, rollback plan, P0/P1
  register, launch gate, job reliability register, paid-beta cutover.
- [`observability/`](./observability/) — logging, errors, Sentry.

## Subsystems

- [`billing/`](./billing/) — usage and limit model, trial identity and reuse protection.
- [`security/`](./security/) — policy engine, security test matrix.
- [`integrations/`](./integrations/) — Gmail invoice import, Slack app manifest.
