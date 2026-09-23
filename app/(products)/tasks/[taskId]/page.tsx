import TaskPreviewPage from "@/app/(dashboard)/dashboard/tasks/[taskId]/page";

export default function TasksProductDetailPage({ params }: PageProps<"/tasks/[taskId]">) {
  return <TaskPreviewPage params={params} productIsolated />;
}
