import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One provider gets a different brief, and only one.
//
// sarvam-105b reasons inside its completion budget. Handed the full compose brief — roughly
// 5,500 characters of craft instruction before the business context even starts — it spent
// the whole 4,096-token allowance deliberating and returned content: null with
// finish_reason "length". A bigger budget bought longer deliberation, not an answer.
//
// So Sarvam gets a compact brief. The risk that creates is the one these tests exist for:
// that the compact brief leaks to the providers that were working fine, or that it drops
// something the request is not valid without. Both failures are silent — the output still
// parses, it is just worse, and nobody would know which prompt produced it.

const KEY_ENV = {
  SARVAM_API_KEY: "sk_test_sarvam",
  GROQ_API_KEY: "gsk_test_groq",
} as const;

type Call = { url: string; body: string };

function stubFetch(calls: Call[], failFirst = false) {
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    n += 1;
    if (failFirst && n === 1) {
      // The shape Sarvam actually returns when it runs out of budget mid-thought: a 200
      // with no content at all. This is what the fallback has to survive.
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: null, reasoning_content: "…" } }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        title: "t", body: "b", variants: [], hashtags: [], ctas: ["a", "b", "c"],
        campaign: { title: "c", goal: "g", rationale: "r" },
        reasoning: "r", confidence: 0.5,
      }) } }],
    }), { status: 200 });
  }));
}

const compose = async (language: "mr-IN" | "en-IN") => {
  const { composeWithAi } = await import("@/lib/content/ai");
  return composeWithAi({
    tenant: "t",
    prompt: `Announce same-day delivery ${Math.random()}`,
    format: "post",
    audience: "kirana shop owners",
    platforms: [],
    now: Date.now(),
    language,
  });
};

const sarvamCall = (calls: Call[]) => calls.find((c) => c.url.includes("api.sarvam.ai"));
const groqCall = (calls: Call[]) => calls.find((c) => c.url.includes("groq"));

/**
 * The prompt as the model receives it, not as it travels.
 *
 * The request body is JSON, so asserting against the raw string tests the wire encoding —
 * `"confidence"` is `\"confidence\"` in there, and a passing assertion would be matching
 * escaping rather than content.
 */
function promptOf(call: Call | undefined): string {
  expect(call, "no call to inspect").toBeTruthy();
  const parsed = JSON.parse(call!.body) as { messages?: { role: string; content: string }[] };
  const user = parsed.messages?.find((m) => m.role === "user");
  expect(user, "no user message in the request body").toBeTruthy();
  return user!.content;
}

/** Markers that only ever appear in the full brief's craft blocks. */
const FULL_BRIEF_MARKERS = ["CONTEXT YOU MUST USE", "RULES"];

beforeEach(() => {
  for (const [k, v] of Object.entries(KEY_ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Sarvam gets the compact brief", () => {
  it("sends it a fraction of the full brief", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    await compose("mr-IN");

    const prompt = promptOf(sarvamCall(calls));

    // The failure this whole change exists to fix was one of size. Pin it as size.
    expect(prompt.length).toBeLessThan(4000);
    for (const marker of FULL_BRIEF_MARKERS) {
      expect(prompt, `compact brief still carries "${marker}"`).not.toContain(marker);
    }
  });

  it("keeps everything the request is not valid without", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    await compose("mr-IN");
    const body = promptOf(sarvamCall(calls));

    // The language instruction is the entire reason this provider is preferred.
    expect(body).toContain("WRITE IN");
    expect(body).toMatch(/natively, not translated/);
    expect(body).toContain("मराठी");
    // The ask, the audience, and the shape the parser needs.
    expect(body).toContain("THE ASK");
    expect(body).toContain("kirana shop owners");
    expect(body).toContain("Return ONLY valid JSON");
    expect(body).toContain('"confidence"');
    // The one craft rule that changes whether the output is true rather than whether it
    // is good. Taste can be cut; this cannot.
    expect(body).toMatch(/Do not invent statistics/i);
  });
});

describe("every other provider is untouched", () => {
  it("Groq still receives the full brief when Sarvam returns nothing", async () => {
    const calls: Call[] = [];
    stubFetch(calls, /* failFirst */ true);
    await compose("mr-IN");

    const sarvam = sarvamCall(calls);
    const groq = groqCall(calls);
    expect(sarvam, "Sarvam should be tried first for Marathi").toBeTruthy();
    expect(groq, "Groq must still be reachable behind Sarvam").toBeTruthy();

    // The two providers in one request received two different briefs. That is the point.
    const sarvamPrompt = promptOf(sarvam);
    const groqPrompt = promptOf(groq);
    expect(groqPrompt).not.toBe(sarvamPrompt);
    expect(groqPrompt.length).toBeGreaterThan(sarvamPrompt.length);
    for (const marker of FULL_BRIEF_MARKERS) {
      expect(groqPrompt, `Groq lost "${marker}" from the full brief`).toContain(marker);
    }
  });

  it("English is unchanged: no Sarvam, and the full brief", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    await compose("en-IN");

    expect(sarvamCall(calls), "English must not prefer Sarvam").toBeFalsy();
    const groqPrompt = promptOf(groqCall(calls));
    for (const marker of FULL_BRIEF_MARKERS) {
      expect(groqPrompt).toContain(marker);
    }
  });
});

describe("the override is opt-in", () => {
  it("generateText without promptFor sends one prompt to whoever answers", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "PLAIN-PROMPT-MARKER", cacheSalt: String(Math.random()) });

    expect(res.ok).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    // Every call carries the caller's prompt verbatim. Omitting promptFor must change
    // nothing for the callers that have never heard of it.
    for (const c of calls) expect(promptOf(c)).toContain("PLAIN-PROMPT-MARKER");
  });
});
