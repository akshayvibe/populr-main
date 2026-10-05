import { afterEach, describe, expect, it, vi } from "vitest";

// Cancellation, all the way to the provider request.
//
// composeWithAi already checked `signal.aborted` between its steps, so a cancelled request
// LOOKED cancelled — it returned early and the caller saw the right thing. What it did not
// do was stop the request already in flight, because generateText had no signal parameter
// at all. On English that wasted six seconds. On Marathi it left a fifty-five second Sarvam
// call running and billed in full, for a post nobody would ever read.
//
// Two properties matter and they pull against each other. The signal has to reach fetch, and
// an abort has to be distinguishable from our own timeout — both surface as AbortError, and
// treating a cancellation as a timeout retries it twice and then tries every other provider,
// which is the opposite of what cancelling means.

type Call = { url: string; signal: AbortSignal | null };

const KEYS = { GROQ_API_KEY: "gsk_test_groq", SARVAM_API_KEY: "sk_test_sarvam" } as const;
const stubKeys = () => { for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v); };

/** Records every provider request and lets the test decide how each one resolves. */
function captureFetch(calls: Call[], respond: (n: number, signal: AbortSignal | null) => Promise<Response>) {
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const signal = (init?.signal as AbortSignal) ?? null;
    calls.push({ url: String(url), signal });
    return respond(++n, signal);
  }));
}

const ok = () => new Response(JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: "fine" } }],
}), { status: 200 });

/** A provider call that never answers until the request is aborted. */
function hangUntilAborted(signal: AbortSignal | null): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("the signal reaches the provider request", () => {
  it("aborting the caller aborts the in-flight request", async () => {
    stubKeys();
    const calls: Call[] = [];
    const ac = new AbortController();
    let sawAbort = false;
    captureFetch(calls, async (_n, signal) => {
      // Asserted while the request is open, not after. Once it settles the listener is
      // removed — deliberately, so a completed request does not hold a reference to the
      // caller's controller — so a post-hoc check would be testing the cleanup instead.
      signal?.addEventListener("abort", () => { sawAbort = true; }, { once: true });
      setTimeout(() => ac.abort(), 5);
      return hangUntilAborted(signal);
    });

    const { generateText } = await import("@/lib/services/llm");
    await generateText({ prompt: "x", cacheSalt: String(Math.random()), signal: ac.signal });

    expect(calls.length, "no provider request was made").toBeGreaterThan(0);
    expect(calls[0].signal, "no signal reached fetch").toBeTruthy();
    expect(sawAbort, "the caller aborting did not abort the provider request").toBe(true);
  });

  it("still works for the callers that pass no signal", async () => {
    stubKeys();
    const calls: Call[] = [];
    captureFetch(calls, async () => ok());
    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()) });
    expect(res.ok).toBe(true);
    // A signal is still attached — the timeout needs one — it just has no caller behind it.
    expect(calls[0].signal).toBeTruthy();
  });
});

describe("a cancellation is not an outage", () => {
  it("does not retry and does not try the next provider", async () => {
    stubKeys();
    const calls: Call[] = [];
    const ac = new AbortController();
    captureFetch(calls, async (_n, signal) => {
      // Cancel the moment the first request is in flight.
      setTimeout(() => ac.abort(), 5);
      return hangUntilAborted(signal);
    });

    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()), signal: ac.signal });

    expect(res.ok).toBe(false);
    // Exactly one attempt. Two retries plus a second provider would be four.
    expect(calls.length, `expected one attempt, saw ${calls.length}`).toBe(1);
  });

  it("reports cancellation distinctly from providers being down", async () => {
    stubKeys();
    const calls: Call[] = [];
    const ac = new AbortController();
    captureFetch(calls, async (_n, signal) => {
      setTimeout(() => ac.abort(), 5);
      return hangUntilAborted(signal);
    });

    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()), signal: ac.signal });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      // Not "our AI providers are temporarily busy" — nothing was busy, the caller left.
      expect(res.error).toBe("cancelled");
      expect(res.status).toBe(499);
    }
  });

  it("an already-aborted signal makes no provider call at all", async () => {
    stubKeys();
    const calls: Call[] = [];
    captureFetch(calls, async () => ok());
    const { generateText } = await import("@/lib/services/llm");
    const ac = new AbortController();
    ac.abort();
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()), signal: ac.signal });

    expect(res.ok).toBe(false);
    expect(calls.length, "a cancelled request still called a provider").toBe(0);
  });
});

describe("a real failure still falls back", () => {
  it("a 500 is retried and the chain continues — cancellation changed nothing here", async () => {
    stubKeys();
    const calls: Call[] = [];
    // Every call fails transiently. Without the cancellation change this walked retries and
    // providers; it must still do exactly that.
    captureFetch(calls, async () => new Response("upstream exploded", { status: 500 }));

    const { generateText } = await import("@/lib/services/llm");
    const res = await generateText({ prompt: "x", cacheSalt: String(Math.random()) });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toBe("cancelled");
    // More than one attempt: the retry path is intact.
    expect(calls.length).toBeGreaterThan(1);
  }, 30_000);
});
