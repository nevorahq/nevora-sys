import TransactionDetailPage from "@/app/(dashboard)/dashboard/money/[transactionId]/page";

export default function FinanceProductDetailPage({
  params,
}: PageProps<"/finance/[transactionId]">) {
  return <TransactionDetailPage params={params} productIsolated />;
}
