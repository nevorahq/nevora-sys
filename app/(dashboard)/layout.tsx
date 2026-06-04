/**
 * Layout для dashboard route group.
 *
 * Все страницы внутри (dashboard)/ будут обёрнуты этим layout.
 * Сейчас просто пробрасывает children.
 * Позже здесь можно добавить sidebar, header, navigation.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
