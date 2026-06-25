import type { DashboardMetrics } from "@/modules/analytics";

export function buildSummaryPrompt(
  entityType: string,
  entityData: Record<string, unknown>,
): string {
  return `You are a business assistant for a SaaS platform. Generate a concise, professional summary (2-3 sentences) for the following ${entityType}.

Data:
${JSON.stringify(entityData, null, 2)}

Requirements:
- Be factual and specific, reference actual values from the data
- Focus on business-relevant information
- No filler phrases like "This is a summary of..."
- Return only the summary text, nothing else`;
}

export function buildInsightsPrompt(
  metrics: DashboardMetrics,
  periodDays: number,
): string {
  return `You are a business intelligence analyst. Analyze the following business metrics and generate 3-5 actionable insights.

Period: last ${periodDays} days
Metrics:
${JSON.stringify(metrics, null, 2)}

For each insight, respond with a JSON array (no markdown, no code blocks) in this exact format:
[
  {
    "insight_type": "trend|anomaly|forecast|comparison|recommendation_summary",
    "module": "tasks|crm|documents|analytics|overall",
    "title": "Short title (max 80 chars)",
    "body": "Detailed explanation with specific numbers (max 300 chars)",
    "severity": "info|warning|success|critical"
  }
]

Focus on:
- Overdue tasks if tasks_overdue > 0
- Win rate trends if deals exist
- Completion rates
- Activity levels
- Actionable next steps`;
}

export function buildRecommendationsPrompt(
  metrics: DashboardMetrics,
): string {
  return `You are a business advisor. Based on the following metrics, generate 3-5 specific, actionable recommendations.

Metrics:
${JSON.stringify(metrics, null, 2)}

Respond with a JSON array (no markdown, no code blocks):
[
  {
    "title": "Short action title (max 80 chars)",
    "description": "What to do and why (max 200 chars)",
    "action_type": "follow_up|close_deal|reassign_task|update_document|contact_client|review_pipeline|custom",
    "priority": "low|medium|high|critical"
  }
]

Be specific and reference actual numbers from the metrics.`;
}
