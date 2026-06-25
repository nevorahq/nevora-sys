import {
  SparklesIcon,
  LightbulbIcon,
  ZapIcon,
  XIcon,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import {
  getInsights,
  getRecommendations,
  SEVERITY_STYLES,
  PRIORITY_STYLES,
} from "@/modules/ai";
import type { AiInsight, AiRecommendation } from "@/modules/ai";
import {
  triggerGenerateInsights,
  triggerGenerateRecommendations,
  triggerDismissRecommendation,
} from "./actions";

export default async function AiPage() {
  const { org } = await requireOrg();

  const [insights, recommendations] = await Promise.all([
    getInsights(org.id, { limit: 10 }),
    getRecommendations(org.id, { status: "pending", limit: 8 }),
  ]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
            <SparklesIcon size={22} className="text-purple-500" />
            AI Assistant
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Insights and recommendations powered by Claude
          </p>
        </div>

        {/* Generate buttons */}
        <div className="flex gap-2">
          <GenerateButton
            action={triggerGenerateRecommendations}
            label="Recommendations"
            icon={<ZapIcon size={14} />}
          />
          <GenerateButton
            action={triggerGenerateInsights}
            label="Insights"
            icon={<LightbulbIcon size={14} />}
          />
        </div>
      </div>

      {/* Recommendations */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Recommendations
          {recommendations.length > 0 && (
            <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              {recommendations.length}
            </span>
          )}
        </h2>

        {recommendations.length > 0 ? (
          <div className="flex flex-col gap-3">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ZapIcon size={28} />}
            title="No recommendations yet"
            sub='Click "Recommendations" to generate AI-powered action items.'
          />
        )}
      </section>

      {/* Insights */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Business Insights
        </h2>

        {insights.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<LightbulbIcon size={28} />}
            title="No insights yet"
            sub='Click "Insights" to analyze your business metrics with Claude.'
          />
        )}
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function GenerateButton({
  action,
  label,
  icon,
}: {
  action: (fd: FormData) => Promise<void>;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-secondary hover:text-text-primary"
      >
        {icon}
        {label}
      </button>
    </form>
  );
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const cls = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info;
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-start gap-2">
        <LightbulbIcon size={14} className="mt-0.5 shrink-0 opacity-70" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{insight.title}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">{insight.body}</p>
          <p className="mt-2 text-[10px] opacity-60 capitalize">
            {insight.module} · {insight.insight_type} ·{" "}
            {new Date(insight.generated_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: AiRecommendation }) {
  const priorityCls = PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.medium;
  return (
    <div className="soft-card-sm flex items-start gap-4 p-4">
      <ZapIcon size={16} className={`mt-0.5 shrink-0 ${priorityCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{rec.title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{rec.description}</p>
        <p className="mt-1.5 text-[10px] capitalize text-text-muted">
          {rec.action_type.replace(/_/g, " ")} ·{" "}
          <span className={priorityCls}>{rec.priority}</span>
        </p>
      </div>
      <form action={triggerDismissRecommendation}>
        <input type="hidden" name="recommendationId" value={rec.id} />
        <button
          type="submit"
          title="Dismiss"
          className="shrink-0 rounded-md p-1.5 text-text-muted transition hover:bg-surface-secondary hover:text-text-primary"
        >
          <XIcon size={13} />
        </button>
      </form>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-text-muted opacity-60">
      {icon}
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-xs text-xs">{sub}</p>
    </div>
  );
}
