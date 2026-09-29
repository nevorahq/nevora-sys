import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

vi.mock("server-only", () => ({}));

import {
  classifyTranscriptionError,
  getTranscriptionConfig,
  releaseVoiceTranscription,
  reserveVoiceTranscription,
  transcribeVoice,
} from "./transcribe-voice";

const config = { apiKey: "sk-test", model: "gpt-4o-mini-transcribe" };
const audio = { bytes: new Uint8Array([1, 2]).buffer, fileName: "v.ogg", mimeType: "audio/ogg" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getTranscriptionConfig", () => {
  it("is off without a key and defaults the model", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(getTranscriptionConfig()).toBeNull();
    vi.stubEnv("OPENAI_API_KEY", "sk-x");
    vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "");
    expect(getTranscriptionConfig()).toEqual({ apiKey: "sk-x", model: "gpt-4o-mini-transcribe" });
  });
});

describe("transcribeVoice", () => {
  it("posts the audio as multipart with the model and returns the text", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "  Позвонить в банк  " }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await transcribeVoice(config, audio)).toEqual({ ok: true, text: "Позвонить в банк" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect((form.get("file") as File).name).toBe("v.ogg");
  });

  it("reports empty speech and API failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: " " }), { status: 200 })));
    expect(await transcribeVoice(config, audio)).toEqual({ ok: false, reason: "empty" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await transcribeVoice(config, audio)).toEqual({ ok: false, reason: "failed" });

    // The exact body OpenAI returned for an empty balance on 2026-09-29.
    const noCredits = { error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining." } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(noCredits), { status: 429 })));
    expect(await transcribeVoice(config, audio)).toEqual({ ok: false, reason: "unavailable" });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await transcribeVoice(config, audio)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("classifyTranscriptionError", () => {
  it.each([
    [429, { type: "insufficient_quota", code: "credit_balance_exhausted" }, "unavailable"],
    [429, { type: "requests", code: "rate_limit_exceeded" }, "failed"],
    [401, { type: "invalid_request_error", code: "invalid_api_key" }, "unavailable"],
    [403, null, "unavailable"],
    [500, null, "failed"],
    [400, { type: "invalid_request_error", code: "invalid_value" }, "failed"],
  ])("%i %j → %s", (status, error, reason) => {
    expect(classifyTranscriptionError(status, error)).toBe(reason);
  });
});

describe("reserveVoiceTranscription", () => {
  const ctx = { org: { id: "org-1" }, user: { id: "user-1" } } as unknown as CurrentContext;
  const client = (error: unknown) => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: error ? null : { id: "air-1" }, error }) }),
    }));
    return { client: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert };
  };

  it("records the call in the shared AI quota and returns the ledger row", async () => {
    const { client: supabase, insert } = client(null);
    expect(await reserveVoiceTranscription(supabase, ctx, 14)).toBe("air-1");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", user_id: "user-1", action_type: "voice_transcription", metadata: { duration_seconds: 14 } }),
    );
  });

  it("says no when the quota trigger rejects the insert", async () => {
    const { client: supabase } = client({ code: "P0001", message: "plan_limit_exceeded" });
    expect(await reserveVoiceTranscription(supabase, ctx, 14)).toBeNull();
  });

  it("releases exactly that voice row, scoped to the organization", async () => {
    const filters: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {};
    builder.delete = () => builder;
    builder.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return filters.length === 3 ? Promise.resolve({ error: null }) : builder;
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    await releaseVoiceTranscription(supabase, ctx, "air-1");
    expect(filters).toEqual([
      ["id", "air-1"],
      ["organization_id", "org-1"],
      ["action_type", "voice_transcription"],
    ]);
  });
});
