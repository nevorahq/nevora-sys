import { requireOrg } from "@/lib/auth/require-org";
import { getTodosQuery } from "@/features/todos/queries/get-todos.query";
import { getProjects } from "@/modules/tasks/projects/queries/get-projects";
import { TodoCreateButton } from "@/features/todos/components/todo-create-button";
import { TodoList } from "@/features/todos/components/todo-list";
import { TasksSubnav } from "@/features/todos/components/tasks-subnav";
import { TaskSortSelect } from "@/features/todos/components/task-sort-select";
import { parseTaskSort } from "@/modules/tasks/schemas/task-sort.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort = parseTaskSort(rawSort);

  const { org } = await requireOrg();
  const [todos, projects, { dict }] = await Promise.all([
    getTodosQuery(org.id, { sort }),
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
