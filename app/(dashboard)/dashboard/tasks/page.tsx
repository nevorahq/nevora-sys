import { getTodosQuery } from "@/features/todos/queries/get-todos.query";
import { TodoCreateButton } from "@/features/todos/components/todo-create-button";
import { TodoList } from "@/features/todos/components/todo-list";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function TasksPage() {
  const [todos, { dict }] = await Promise.all([
    getTodosQuery(),
    getDictionary(),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">
          {dict.dashboard.taskSummary.title}
        </h1>
        <TodoCreateButton dict={dict} />
      </div>

      <section className="mt-6">
        <TodoList todos={todos} dict={dict} />
      </section>
    </>
  );
}
