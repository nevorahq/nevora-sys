import { ProductShell } from "@/modules/products/components/product-shell";

export default function SubscriptionsProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="subscriptions">{children}</ProductShell>;
}
