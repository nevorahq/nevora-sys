import { ProductShell } from "@/modules/products/components/product-shell";

export default function TasksProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="tasks">{children}</ProductShell>;
}
