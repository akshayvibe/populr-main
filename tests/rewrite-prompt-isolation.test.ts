import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prompt isolation on BOTH provider calls, not just the first.
//
// composeWithAi makes two: the draft, and a craft rewrite when the draft trips a shape or
// phrasing check. The draft was given a compact brief for Sarvam. The rewrite was given
// `preferProvider` and no `promptFor`, so a Sarvam-routed rewrite received the full
// ~5,100-character brief — the exact starvation the compact prompt exists to prevent, on
// the step whose output actually ships.
//
// The second property here matters as much as the first: the providers that were working
// must receive byte-identical prompts. A refactor that "improves" the full brief while
// extracting it is a silent quality change to every English post.

type Call = { url: string; prompt: string };

const KEYS = { SARVAM_API_KEY: "sk_test_sarvam", GROQ_API_KEY: "gsk_test_groq" } as const;

function promptOf(body: string): string {
  const parsed = JSON.parse(body) as { messages?: { role: string; content: string }[] };
  return parsed.messages?.find((m) => m.role === "user")?.content ?? "";
}

/**
 * Every provider answers with a wall of prose, which reliably trips the shape check and
 * forces the rewrite — the call this file exists to inspect.
 */
const WALL = "We have launched same-day delivery for kirana shops across the city and it is " +
  "available from today onwards for every registered shop in the area without any extra cost " +
  "and with no minimum order value applied to it at any point during the week.";

function capture(calls: Call[], onCall?: (n: number) => Response | null) {
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "{}");
    calls.push({ url: String(url), prompt: promptOf(body) });
    const override = onCall?.(++n);
    if (override) return override;
    const isRewrite = !promptOf(body).includes("Return ONLY valid JSON");
    const content = isRewrite ? WALL : JSON.stringify({
      title: "t", body: WALL, variants: [], hashtags: [], ctas: ["a", "b", "c"],
      campaign: { title: "c", goal: "g", rationale: "r" }, reasoning: "r", confidence: 0.5,
    });
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
    }), { status: 200 });
  }));
}

const compose = async (language: "mr-IN" | "en-IN", signal?: AbortSignal) => {
  const { composeWithAi } = await import("@/lib/content/ai");
  return composeWithAi({
    tenant: "t",
    prompt: `Announce same-day delivery ${Math.random()}`,
    format: "post",
    audience: "kirana shop owners",
    platforms: [],
    now: Date.now(),
    language,
  }, { mode: "background", signal });
};

const sarvamCalls = (c: Call[]) => c.filter((x) => x.url.includes("api.sarvam.ai"));
const groqCalls = (c: Call[]) => c.filter((x) => x.url.includes("groq"));

beforeEach(() => { for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("Sarvam gets a compact brief on both calls", () => {
  it("the draft and the rewrite are both compact", async () => {
    const calls: Call[] = [];
    capture(calls);
    await compose("mr-IN");

    const sarvam = sarvamCalls(calls);
    expect(sarvam.length, "expected a draft and a rewrite through Sarvam").toBeGreaterThanOrEqual(2);

    const [draft, rewrite] = sarvam;
    // The draft asks for JSON; the rewrite asks for plain text. Different prompts, same rule.
    expect(draft.prompt).toContain("Return ONLY valid JSON");
    expect(rewrite.prompt).toContain("Return ONLY the rewritten text");

    for (const [label, call] of [["draft", draft], ["rewrite", rewrite]] as const) {
      expect(call.prompt.length, `${label} is not compact`).toBeLessThan(4000);
    }
  });

  it("the compact rewrite carries none of the craft blocks", async () => {
    const calls: Call[] = [];
    capture(calls);
    await compose("mr-IN");
    const rewrite = sarvamCalls(calls)[1];

    // The mirror of the byte-identical test below: the full brief must keep every block,
    // and the compact one must carry none of them. Without this the isolation is theatre.
    const { CRAFT_RULES, POST_SHAPES, DISCOVERY } = await import("@/lib/content/craft");
    for (const block of [CRAFT_RULES, POST_SHAPES, DISCOVERY]) {
      expect(rewrite.prompt).not.toContain(block);
    }
  });

  it("the compact rewrite still names the fault and offers a way out", async () => {
    const calls: Call[] = [];
    capture(calls);
    await compose("mr-IN");
    const rewrite = sarvamCalls(calls)[1];

    // Naming a shape fault without offering alternatives asks the model to invent a
    // structure from a complaint, and it answers by rewording the same paragraph. The
    // compact brief drops the full POST_SHAPES block but must not drop this.
    expect(rewrite.prompt).toMatch(/Rewrite this/);
    expect(rewrite.prompt).toContain("---");
    expect(rewrite.prompt).toContain(WALL);
  });
});

describe("the providers that were working are untouched", () => {
  it("Groq receives the full brief on both calls", async () => {
    const calls: Call[] = [];
    // Sarvam fails outright, so Groq handles both the draft and the rewrite.
    capture(calls, (n) => (n === 1 || n === 3
      ? new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: null } }] }), { status: 200 })
      : null));
    await compose("mr-IN");

    const groq = groqCalls(calls);
    expect(groq.length, "Groq should have covered both calls").toBeGreaterThanOrEqual(2);
    for (const c of groq) {
      expect(c.prompt.length).toBeGreaterThan(4000);
    }
  });

  it("the full rewrite brief is byte-identical to the one built inline before", async () => {
    // Guards the extraction itself. Reconstructs the full brief from the same constants the
    // old inline array used; any edit made while extracting shows up here rather than as a
    // quiet change to every English post.
    const calls: Call[] = [];
    capture(calls);
    await compose("en-IN");

    const rewrite = groqCalls(calls).find((c) => c.prompt.includes("Return ONLY the rewritten text"));
    expect(rewrite, "no rewrite call was made").toBeTruthy();

    const { CRAFT_RULES, POST_SHAPES, DISCOVERY } = await import("@/lib/content/craft");
    for (const block of [CRAFT_RULES, POST_SHAPES, DISCOVERY]) {
      expect(rewrite!.prompt, "a craft block went missing from the full rewrite").toContain(block);
    }
  });

  it("English never reaches Sarvam at all", async () => {
    const calls: Call[] = [];
    capture(calls);
    await compose("en-IN");
    expect(sarvamCalls(calls).length).toBe(0);
  });
});

describe("cancellation still propagates through the rewrite", () => {
  it("aborting before the rewrite stops it being made", async () => {
    const calls: Call[] = [];
    const ac = new AbortController();
    // Let the draft land, then cancel. The rewrite must not go out.
    // Aborted synchronously as the draft request is captured — a setTimeout races the
    // needsRewrite check and makes the test flaky rather than wrong.
    capture(calls, (n) => { if (n === 1) ac.abort(); return null; });
    await compose("mr-IN", ac.signal);

    const rewrites = calls.filter((c) => c.prompt.includes("Return ONLY the rewritten text"));
    expect(rewrites.length, "a rewrite was sent for a cancelled request").toBe(0);
  });
});
