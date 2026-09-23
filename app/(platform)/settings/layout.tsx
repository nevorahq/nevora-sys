import { cookies } from "next/headers";
import { ProductShell } from "@/modules/products/components/product-shell";
import { parseProductContext, PRODUCT_CONTEXT_COOKIE } from "@/modules/products/product-context";
import SettingsSectionLayout from "@/app/(dashboard)/dashboard/settings/layout";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const product = parseProductContext((await cookies()).get(PRODUCT_CONTEXT_COOKIE)?.value);

  return (
    <ProductShell product={product}>
      <SettingsSectionLayout>{children}</SettingsSectionLayout>
    </ProductShell>
  );
}
