import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

vi.mock("server-only", () => ({}));

import { getTranscriptionConfig, reserveVoiceTranscription, transcribeVoice } from "./transcribe-voice";

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

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await transcribeVoice(config, audio)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("reserveVoiceTranscription", () => {
  const ctx = { org: { id: "org-1" }, user: { id: "user-1" } } as unknown as CurrentContext;
  const client = (error: unknown) => {
    const insert = vi.fn(async () => ({ error }));
    return { client: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert };
  };

  it("records the call in the shared AI quota", async () => {
    const { client: supabase, insert } = client(null);
    expect(await reserveVoiceTranscription(supabase, ctx, 14)).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", user_id: "user-1", action_type: "voice_transcription", metadata: { duration_seconds: 14 } }),
    );
  });

  it("says no when the quota trigger rejects the insert", async () => {
    const { client: supabase } = client({ code: "P0001", message: "plan_limit_exceeded" });
    expect(await reserveVoiceTranscription(supabase, ctx, 14)).toBe(false);
  });
});
