import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS } from "@/lib/services/llm";

// The budget and the timeout a provider actually receives, on both execution paths.
//
// These exist because the two paths disagreed. generateText was fixed to send Sarvam its
// measured 12,288 after a live call proved 4,096 returns content: null; the streaming path
// kept handing every provider the shared 4,096. Same provider, same model, different answer
// depending on which code path reached it — and the streaming one would have failed exactly
// the way the non-streaming one used to.
//
// So these assert the wire, not the config: what was in the request body, not what the
// table says. A capability nothing reads is a comment.

type Call = { url: string; body: Record<string, unknown> };

function capture(calls: Call[], streaming: boolean) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    if (streaming) {
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }] })}\n\n` +
                  `data: [DONE]\n\n`;
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    }), { status: 200 });
  }));
}

const ALL_KEYS = {
  SARVAM_API_KEY: "sk_test_sarvam",
  GROQ_API_KEY: "gsk_test_groq",
  // OpenAI guards on an "sk-" prefix; "sk_" looks unconfigured and the provider vanishes.
  OPENAI_API_KEY: "sk-test-openai",
  GEMINI_API_KEY: "test_gemini",
} as const;

/** Only this provider configured, so the chain cannot reach past it. */
function onlyProvider(name: keyof typeof ALL_KEYS) {
  for (const k of Object.keys(ALL_KEYS) as (keyof typeof ALL_KEYS)[]) {
    vi.stubEnv(k, k === name ? ALL_KEYS[k] : "");
  }
}

const budgetOf = (c: Call) =>
  (c.body.max_tokens as number) ??
  ((c.body.generationConfig as { maxOutputTokens?: number } | undefined)?.maxOutputTokens);

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("the non-streaming path sends each provider its own budget", () => {
  it("Sarvam gets its measured 12,288", async () => {
    onlyProvider("SARVAM_API_KEY");
    const calls: Call[] = [];
    capture(calls, false);
    const { generateText } = await import("@/lib/services/llm");
    await generateText({ prompt: "x", cacheSalt: String(Math.random()) });
    expect(calls.length).toBeGreaterThan(0);
    expect(budgetOf(calls[0])).toBe(12_288);
  });

  it("the general-purpose providers keep the shared budget", async () => {
    for (const name of ["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"] as const) {
      onlyProvider(name);
      const calls: Call[] = [];
      capture(calls, false);
      vi.resetModules();
      const { generateText } = await import("@/lib/services/llm");
      await generateText({ prompt: "x", cacheSalt: String(Math.random()) });
      expect(calls.length, name).toBeGreaterThan(0);
      // 4,096 is the shared default. Any provider silently gaining its own budget is a
      // behaviour change nobody asked for.
      expect(budgetOf(calls[0]), name).toBe(4096);
      vi.unstubAllGlobals();
    }
  });
});

describe("the streaming path agrees with it", () => {
  it("Sarvam streams with 12,288, not the shared 4,096", async () => {
    onlyProvider("SARVAM_API_KEY");
    const calls: Call[] = [];
    capture(calls, true);
    const { streamText } = await import("@/lib/services/llm-stream");
    const out: string[] = [];
    for await (const ev of streamText("x")) {
      if (ev.type === "text") out.push(ev.value);
    }
    expect(calls.length, "stream never opened").toBeGreaterThan(0);
    expect(budgetOf(calls[0])).toBe(12_288);
    // And the stream is actually consumable, so the assertion above is about a real call.
    expect(out.join("")).toContain("ok");
  });

  it("the general-purpose providers stream with the shared budget", async () => {
    for (const name of ["GROQ_API_KEY", "OPENAI_API_KEY"] as const) {
      onlyProvider(name);
      const calls: Call[] = [];
      capture(calls, true);
      vi.resetModules();
      const { streamText } = await import("@/lib/services/llm-stream");
      for await (const _ of streamText("x")) { /* drain */ }
      expect(calls.length, name).toBeGreaterThan(0);
      expect(budgetOf(calls[0]), name).toBe(4096);
      vi.unstubAllGlobals();
    }
  });

  it("asks for a stream at all", async () => {
    onlyProvider("SARVAM_API_KEY");
    const calls: Call[] = [];
    capture(calls, true);
    const { streamText } = await import("@/lib/services/llm-stream");
    for await (const _ of streamText("x")) { /* drain */ }
    expect(calls[0].body.stream).toBe(true);
  });
});

describe("the capability table says what the wire proves", () => {
  it("declares Sarvam slow, streaming-capable, and generously budgeted", () => {
    const s = PROVIDERS.find((p) => p.name === "sarvam")!;
    expect(s.capabilities.maxOutputTokens).toBe(12_288);
    expect(s.capabilities.timeoutMs).toBe(120_000);
    expect(s.capabilities.latencyClass).toBe("slow");
    // Measured, not assumed: the API does emit SSE. What it does NOT do is emit the answer
    // early — first content chunk at 14.0s after 1,652 reasoning chunks.
    expect(s.capabilities.supportsStreaming).toBe(true);
  });
});
