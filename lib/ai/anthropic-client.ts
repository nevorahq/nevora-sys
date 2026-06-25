import Anthropic from "@anthropic-ai/sdk";

// Singleton — создаётся один раз при первом обращении
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Модели для разных задач
export const AI_MODELS = {
  fast:    "claude-haiku-4-5-20251001",   // краткие саммари, рекомендации
  default: "claude-sonnet-4-6",           // инсайты, анализ
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];
