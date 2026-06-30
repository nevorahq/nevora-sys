# Debug report: task creation failed with todos RLS 42501

- Symptom: `createTodoAction` failed with `42501: new row violates row-level security policy for table "todos"`.
- Root cause: task creation used `INSERT ... RETURNING id` through `.insert(...).select("id").single()`. PostgreSQL applies the task-scoped `todos_org_select` policy to the `RETURNING` row before the new task is visible through the post-insert assignee flow, so the insert was rejected even though `can_write_data(organization_id)` returned true.
- Reproduction: under the authenticated role, the same payload failed with `RETURNING id` and succeeded without `RETURNING`; a subsequent SELECT succeeded and showed the creator inserted into `task_assignees`.
- Fix: generate the task UUID in the server action, include it in the INSERT, and do not request RETURNING. Applied to both dashboard creation paths (`features/todos/actions/create-todo.action.ts` and `modules/tasks/actions/create-task.action.ts`).
- Regression test: `features/todos/actions/create-todo.action.test.ts` uses an INSERT-only Supabase fake; reintroducing `.select()`/`.single()` makes the test fail.
- Verification: local PostgreSQL RLS reproduction passed, 229 tests passed, TypeScript passed, production build passed, ESLint had no errors (one unrelated pre-existing warning).
- Status: DONE.
