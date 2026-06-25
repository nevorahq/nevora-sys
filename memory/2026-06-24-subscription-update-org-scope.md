# Subscription update org-scope investigation — 2026-06-24

- Symptom: `/dashboard/subscriptions` update failed with `42703: column subscriptions.user_id does not exist`.
- Root cause: `updateSubscriptionAction` still used the pre-multitenant `user_id` predicate after the subscriptions table moved to `organization_id` scope.
- Fix: resolve `requireOrg()`, scope the update by `organization_id`, record `updated_by`, and publish `subscription.updated` after a successful update.
- Verification: TypeScript, ESLint, `git diff --check`, and 61 Vitest tests passed.
- Required live verification: update a subscription and confirm both the updated fields and `subscription.updated` in `domain_events`.
