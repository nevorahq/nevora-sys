import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { getTasksApplication } from "@/platform/tasks/server";
import { taskToTodo } from "@/features/todos/lib/task-to-todo";
import { getProjects } from "@/modules/tasks/server";
import { TodoCreateButton } from "@/features/todos/components/todo-create-button";
import { TodoList } from "@/features/todos/components/todo-list";
import { TasksSubnav } from "@/features/todos/components/tasks-subnav";
import { TaskSortSelect } from "@/features/todos/components/task-sort-select";
import { parseTaskSort } from "@nevora/tasks-contracts";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort = parseTaskSort(rawSort);

  const ctx = await requireOrg();
  const { org } = ctx;
  // Reads go through the Tasks transport seam so TASKS_TRANSPORT (shadow,
  // http-read, http) covers the Tasks page itself, not only cross-product calls.
  const tasks = await getTasksApplication({ supabase: await createClient(), currentContext: ctx });
  const [todos, projects, { dict }] = await Promise.all([
    tasks.listTasks({ sort, scope: "organization" }).then((rows) => rows.map(taskToTodo)),
    getProjects(org.id, { status: ["active", "paused"] }),
    getDictionary(),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          {dict.dashboard.taskSummary.title}
        </h1>
        <TodoCreateButton dict={dict} projects={projectOptions} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TasksSubnav />
        <TaskSortSelect current={sort} />
      </div>

      <section className="mt-6">
        <TodoList todos={todos} dict={dict} projects={projectOptions} />
      </section>
    </>
  );
}
