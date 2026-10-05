import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dead-model memo, in both directions.
//
// A model a provider has retired 404s permanently for a given key. generateText learned
// that and stopped asking. streamConfig() filtered by the same memo — so streaming
// benefited from what the other path learned — but streaming never wrote to it. A model
// that 404s during streaming was asked for again on every subsequent stream, forever.
//
// The asymmetry mattered because of which path finds out first. Groq has retired models
// underneath this codebase twice; whichever path hits it first should be the one that
// teaches the other, and only one of them could.

const KEYS = { GROQ_API_KEY: "gsk_test_groq" } as const;

/** What a provider says when a model is gone, as opposed to any other 404. */
const RETIRED_BODY = JSON.stringify({
  error: { message: "The model `openai/gpt-oss-120b` does not exist or you do not have access to it." },
});

type Call = { url: string; model: string };

function capture(calls: Call[], respond: () => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    calls.push({ url: String(url), model: body.model ?? "" });
    return respond();
  }));
}

const retired = () => new Response(RETIRED_BODY, { status: 404 });
const sse = () => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}\n\ndata: [DONE]\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
);

beforeEach(async () => {
  for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
  const { resetDeadModelsForTests } = await import("@/lib/services/llm");
  resetDeadModelsForTests();
});
afterEach(async () => {
  const { resetDeadModelsForTests } = await import("@/lib/services/llm");
  resetDeadModelsForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a retired model is remembered", () => {
  it("streaming now teaches the memo, where before it only read it", async () => {
    const calls: Call[] = [];
    capture(calls, retired);
    const { streamText } = await import("@/lib/services/llm-stream");

    for await (const _ of streamText("x")) { /* drain */ }
    const firstRun = calls.length;
    expect(firstRun, "no model was tried").toBeGreaterThan(0);

    // Second stream. Every model tried above is now known dead, so nothing should be asked
    // for again — previously this repeated the first run exactly, every time, forever.
    calls.length = 0;
    for await (const _ of streamText("x")) { /* drain */ }
    expect(calls.length, "a retired model was asked for again").toBe(0);
  });

  it("what streaming learns, the non-streaming path already knows", async () => {
    const calls: Call[] = [];
    capture(calls, retired);
    const { streamText } = await import("@/lib/services/llm-stream");
    for await (const _ of streamText("x")) { /* drain */ }

    // The memo is shared, so generateText must not re-discover what streaming just found.
    calls.length = 0;
    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()) });

    expect(res.ok).toBe(false);
    expect(calls.length, "generateText re-tried a model streaming had already retired").toBe(0);
  });
});

describe("it only remembers what is actually permanent", () => {
  it("a transient failure does not retire the model", async () => {
    const calls: Call[] = [];
    // A 503 with no "does not exist" in it is the provider being busy, not the model being
    // gone. Retiring on that would permanently disable a working model after one bad minute.
    capture(calls, () => new Response("upstream busy", { status: 503 }));
    const { streamText } = await import("@/lib/services/llm-stream");

    for await (const _ of streamText("x")) { /* drain */ }
    const firstRun = calls.length;
    expect(firstRun).toBeGreaterThan(0);

    calls.length = 0;
    for await (const _ of streamText("x")) { /* drain */ }
    expect(calls.length, "a transiently-failing model was wrongly retired").toBe(firstRun);
  });

  it("a working stream retires nothing", async () => {
    const calls: Call[] = [];
    capture(calls, sse);
    const { streamText } = await import("@/lib/services/llm-stream");

    const out: string[] = [];
    for await (const ev of streamText("x")) if (ev.type === "text") out.push(ev.value);
    expect(out.join("")).toContain("hi");

    calls.length = 0;
    for await (const _ of streamText("x")) { /* drain */ }
    expect(calls.length, "a healthy model was retired").toBeGreaterThan(0);
  });
});
