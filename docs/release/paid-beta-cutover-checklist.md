# Paid-Beta Cutover Checklist — `private_beta` → `paid_beta`

**Owner:** Release owner (nevorahq@gmail.com)
**Prereq gate:** do **not** start this checklist until the closed-beta signal is in.
**Related:** [`beta-remaining-2026-07-11.md`](./beta-remaining-2026-07-11.md) ·
[`p0-p1-issue-register.md`](./p0-p1-issue-register.md) ·
billing-mode decision [`billing-mode = private beta`]

**State legend:** `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED`

---

## 0. Gate — the only trigger for flipping to paid

Flipping the billing mode is a **business-signal** decision, not a calendar one.

- [ ] **≥3 of 5 live users** passed the Product Proof table **without hand-holding**.
      (⚑ Stop rule: `<3/5` → stay on `private_beta`, fix onboarding/copy/workflow,
      do **not** proceed. See `beta-remaining` item 3.)

> Until this box is checked, everything below is out of scope. The whole point of
> `private_beta` is to never show a checkout that cannot complete before the core
> loop is proven.

---

## 1. Real Paddle sandbox credentials

Replace the placeholders in the deploy env (Netlify → Site config → Environment)
with **real Paddle sandbox values from the dashboard** — not the `.env.example`
template strings.

- [ ] `PADDLE_ENV=sandbox`
- [ ] `PADDLE_API_KEY` (real `pdl_sdbx_…`)
- [ ] `PADDLE_CLIENT_TOKEN` (real `test_…`)
- [ ] `PADDLE_WEBHOOK_SECRET` (real `pdl_ntfset_…` from the Notification Destination)
- [ ] `PADDLE_SELLER_ID`
- [ ] All six price ids — `PADDLE_PRICE_{STARTER,PRO,BUSINESS}_{MONTHLY,YEARLY}` —
      each a real `pri_…`

> ⚠️ **Fail-closed guards emptiness, not junk.** `getPaddleConfigMissing()` only
> checks `nonEmpty()`. Placeholder strings (`pdl_sdbx_your_api_key`, `pri_your_…`)
> are non-empty, so they pass the startup guard but fail at the first real Paddle
> API call. The values above must be genuine or checkout dies at runtime, not boot.
> — [`modules/billing/config/paddle-env.ts`](../../modules/billing/config/paddle-env.ts)

---

## 2. Flip the mode

- [ ] Set `BILLING_MODE=paid_beta` in the deploy env.
      - `resolveMode()` returns `private_beta` for any unset/unknown value, so this
        must be set **explicitly**.
      - `isPaddleCheckoutAvailable()` returns `true` only when `mode !== private_beta`
        **and** `getPaddleConfigMissing().length === 0` → the CTA flips from
        "Request access" to a real checkout.
- [ ] Confirm the fail-closed guard is happy: with `NODE_ENV=production` +
      `BILLING_MODE=paid_beta`, a missing (empty) Paddle var throws
      `BillingConfigError` **at boot**. A clean deploy boot = config is complete.

---

## 3. Webhook plumbing (the historically fragile part)

- [x] `/api/billing/webhook` is already in `MACHINE_ROUTES`
      ([`shared/config/routes.ts:158`](../../shared/config/routes.ts)) — so the proxy
      will **not** 307-redirect Paddle's session-less POST to `/login` (I-10 fix).
      Keep the `routes.test.ts` drift guard green.
- [ ] Confirm the webhook parses **Paddle** signature format (`ts=…;h1=…`), not the
      old Stripe format (`t=…,v1=…`). Fixed in `edba059` but **never run on live
      sandbox** — this cutover is the first real exercise.
      (memory: `paddle-webhook-is-stripe-format`)
- [ ] Point the Paddle **Notification Destination** at
      `https://<prod-host>/api/billing/webhook` and confirm the secret matches
      `PADDLE_WEBHOOK_SECRET`.

---

## 4. Live sandbox end-to-end (unit-proven, never run live)

Run one real cycle on Paddle sandbox and record evidence.

- [ ] **Checkout** → complete a sandbox purchase for one plan.
- [ ] **Webhook received** → subscription-created event verified (signature OK,
      not 307'd, handler ran) and the org's plan/subscription row updated.
- [ ] **Price → plan mapping** resolves correctly via
      `planForPaddlePriceIdFromConfig` (an unknown price id must map to `null`,
      never to a plan).
- [ ] **Idempotency** → replay/duplicate webhook does not double-apply.
- [ ] **Portal / cancel** path works (billing cancel routes to the provider portal,
      no direct mutation).
- [ ] Record pass/fail + evidence in a proof report alongside this file.

---

## 5. Public-launch blockers that ride along

These are not `paid_beta` blockers per se but are the remaining public-launch items;
close them here since the cutover is the natural moment.

- [ ] **I-07** — rotate the leaked `sk_test_` key in the provider dashboard
      (deferred *to this cutover*; still a public-launch blocker).
- [ ] **I-11** — run CI green on the **actual deploy commit** (migrations `000`→head
      from scratch + SQL harnesses + `next build`).
- [ ] **I-12** — replace placeholder landing contact channels with real ones.

---

## 6. Rollback

- [ ] If anything in §3–§4 fails on live sandbox: set `BILLING_MODE=private_beta`
      (or unset it) and redeploy → checkout instantly reverts to "Request access",
      no data migration needed. The mode flip is the single reversible switch.

---

## Sign-off

- [ ] §0 gate met · §1–§4 done with evidence · §5 blockers closed.
- [ ] Verdict recorded: `paid_beta` live on sandbox / cleared for public launch.

**One line:** flip only after ≥3/5 users pass; real creds (not placeholders) →
`BILLING_MODE=paid_beta` → prove the webhook + checkout live on sandbox → close
I-07/I-11/I-12. The mode env var is the one reversible switch.
