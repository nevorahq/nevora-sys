"use server";

import { generateInsightsAction }        from "@/modules/ai";
import { generateRecommendationsAction } from "@/modules/ai";
import { dismissRecommendationAction }   from "@/modules/ai";

export async function triggerGenerateInsights(formData: FormData): Promise<void> {
  await generateInsightsAction({}, formData);
}

export async function triggerGenerateRecommendations(formData: FormData): Promise<void> {
  await generateRecommendationsAction({}, formData);
}

export async function triggerDismissRecommendation(formData: FormData): Promise<void> {
  await dismissRecommendationAction({}, formData);
}
