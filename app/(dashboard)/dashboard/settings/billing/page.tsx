import { requireOrg } from "@/lib/auth/require-org";
import { getBillingOverview } from "@/modules/settings/queries/get-billing-overview";
import { hasSettingsPermission } from "@/modules/settings/utils/settings-permissions";
import { BillingOverview } from "@/modules/settings/components/BillingOverview";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";

export default async function BillingSettingsPage() {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, "billing.read")) return <SettingsAccessDenied />;
  const overview = await getBillingOverview();
  return (
    <>
      <SettingsHeader title="Billing" description="Review your plan, usage, payment setup, and invoice history." />
      <BillingOverview overview={overview} />
    </>
  );
}
