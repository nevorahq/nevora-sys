# Subscription delete org-scope investigation — 2026-06-24

- Symptom: subscription deletion failed with `42703: column subscriptions.user_id does not exist`.
- Root cause: the delete action still used a legacy user-scoped predicate after subscriptions became organization-scoped.
- Fix: validate UUID, resolve the active organization, require `data.delete`, lookup the subscription in that organization, delete scoped by `organization_id`, and publish `subscription.deleted`.
- Verification: TypeScript, ESLint, `git diff --check`, and 61 Vitest tests passed.
- Required live verification: delete a subscription as manager/admin/owner and confirm the corresponding `subscription.deleted` event.
