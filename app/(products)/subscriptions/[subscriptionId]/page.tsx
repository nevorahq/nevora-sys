import SubscriptionDetailPage from "@/app/(dashboard)/dashboard/subscriptions/[subscriptionId]/page";

export default function SubscriptionsProductDetailPage({
  params,
}: PageProps<"/subscriptions/[subscriptionId]">) {
  return <SubscriptionDetailPage params={params} productIsolated />;
}
