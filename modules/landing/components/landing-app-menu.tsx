import type { PublicLocale } from "@/shared/i18n/constants";
import { ProductEntryMenu } from "@/shared/ui/product-entry-menu";

interface LandingAppMenuProps {
  locale: PublicLocale;
}

/** Landing-обёртка: пункты ведут прямо в защищённые продуктовые маршруты. */
export function LandingAppMenu({ locale }: LandingAppMenuProps) {
  return <ProductEntryMenu locale={locale} />;
}
