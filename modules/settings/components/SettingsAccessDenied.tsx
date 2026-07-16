import Link from "next/link";
import { LockKeyholeIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export async function SettingsAccessDenied() {
  const { dict } = await getDictionary();
  const t = dict.settings.accessDenied;
  return (
    <div className="soft-card-sm flex min-h-64 flex-col items-center justify-center px-6 text-center">
      <LockKeyholeIcon size={28} className="text-text-muted" />
      <h1 className="mt-4 text-lg font-semibold text-text-primary">{t.title}</h1>
      <p className="mt-1 max-w-sm text-sm text-text-muted">{t.body}</p>
      <Link href={ROUTES.settingsProfile} className="mt-5 text-sm font-medium text-text-primary underline underline-offset-4">
        {t.back}
      </Link>
    </div>
  );
}
