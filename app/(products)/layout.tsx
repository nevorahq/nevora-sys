import { AppShell } from "@/modules/app-shell/app-shell";

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
