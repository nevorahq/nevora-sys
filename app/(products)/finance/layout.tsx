import { ProductShell } from "@/modules/products/components/product-shell";

export default function FinanceProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="finance">{children}</ProductShell>;
}
