import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getSubscriptions } from "@/modules/subtracker/server";
import { getRenewalInbox } from "@/modules/subtracker/server";
import { SubCreateButton } from "@/modules/subtracker/ui";
import { SubEmptyState } from "@/modules/subtracker/ui";
import { RenewalInbox } from "@/modules/subtracker/ui";

/**
 * Subscriptions Page — /dashboard/subscriptions
 *
 * Форма создания скрыта по умолчанию.
 * Кнопка "Create Record" открывает модальное окно с формой.
 * После успешного создания — модалка закрывается автоматически.
 */
export default async function SubscriptionsPage() {
  const [{ dict }, ctx] = await Promise.all([getDictionary(), requireOrg()]);
  const [subscriptions, renewalItems] = await Promise.all([
    getSubscriptions(ctx.org.id),
    getRenewalInbox(ctx.org.id),
  ]);

  return (
    <>
      {/* Header + Create Button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {dict.subscriptions.renewal.title}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {dict.subscriptions.renewal.subtitle}
          </p>
        </div>
        <SubCreateButton dict={dict} defaultCurrency={ctx.org.baseCurrency} />
      </div>

      {subscriptions.length > 0 ? (
        <RenewalInbox
          items={renewalItems}
          subscriptions={subscriptions}
          dict={dict}
          canWrite={canDo(ctx, "data.write")}
          canDelete={canDo(ctx, "data.delete")}
        />
      ) : (
        <section className="mt-8"><SubEmptyState dict={dict} defaultCurrency={ctx.org.baseCurrency} /></section>
      )}
    </>
  );
}
