import { requireOrg } from "@/lib/auth/require-org";
import { getBillingOverview } from "@/modules/settings/queries/get-billing-overview";
import { hasSettingsPermission } from "@/modules/settings/utils/settings-permissions";
import { BillingOverview } from "@/modules/settings/components/BillingOverview";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function BillingSettingsPage() {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, "billing.read")) return <SettingsAccessDenied />;
  const [overview, { dict }] = await Promise.all([getBillingOverview(), getDictionary()]);
  return (
    <>
      <SettingsHeader title={dict.settings.header.billingTitle} description={dict.settings.header.billingDescription} />
      <BillingOverview overview={overview} t={dict.settings} />
    </>
  );
}
