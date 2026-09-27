import { beforeEach, describe, expect, it, vi } from "vitest";

// The preference writer, and the race it has to survive.
//
// savePreferences reads state, patches it, writes it back — with an await in the middle.
// Overlapping calls both read the pre-patch state and the last one wins, silently reverting
// the other. It does not reproduce in development because /api/state answers instantly
// without a database; the window only opens when there is a real round trip.
//
// So the delay is forced here rather than hoped for. Without the queue this test fails.

const store: { current: Record<string, unknown> | null } = { current: null };
/** Per-call read delays, consumed in order. Lets one read finish before an earlier one. */
let loadDelays: number[] = [];

vi.mock("@/lib/store", () => ({
  loadState: async () => {
    // Snapshot at call time, like a real fetch: what comes back is the state as it was when
    // the request went out, not as it is when the response lands. Returning store.current
    // after the delay instead models a read that cannot go stale, which is precisely the
    // bug this file exists to catch.
    const snapshot = store.current;
    const d = loadDelays.shift() ?? 0;
    if (d) await new Promise((r) => setTimeout(r, d));
    return { saved: snapshot, cloud: false };
  },
  saveState: (s: Record<string, unknown>) => { store.current = s; },
}));
vi.mock("@/lib/studio/workspace-context", () => ({ resetWorkspaceContext: () => {} }));

const { loadPreferences, savePreferences } = await import("@/lib/studio/preferences");

type Saved = { profile: Record<string, unknown> | null };
const profile = () => (store.current as unknown as Saved | null)?.profile ?? null;

beforeEach(() => { store.current = null; loadDelays = []; });

describe("savePreferences", () => {
  it("creates a profile when none exists, without faking an analysed business", async () => {
    await savePreferences({ language: "mr-IN" });
    const p = profile()!;
    expect(p.language).toBe("mr-IN");
    // hasProfile is !!(name || oneLiner). Both empty keeps that false everywhere.
    expect(p.name).toBe("");
    expect(p.oneLiner).toBe("");
  });

  it("patches rather than replaces, so one setting cannot drop the other", async () => {
    await savePreferences({ language: "ta-IN" });
    await savePreferences({ location: "in-kl" });
    expect(profile()).toMatchObject({ language: "ta-IN", location: "in-kl" });
  });

  it("leaves the analysed fields alone", async () => {
    store.current = { url: "https://x.in", profile: { name: "Anna Traders", oneLiner: "Rice", audience: "kirana", positioning: "bulk", competitors: [], voice: "plain", description: "d" }, competitors: [], chat: [], drafts: [] };
    await savePreferences({ language: "gu-IN" });
    expect(profile()).toMatchObject({ name: "Anna Traders", audience: "kirana", language: "gu-IN" });
  });

  it("does not lose a write when two overlap on uneven reads", async () => {
    // The shape that actually loses data: the first read is the slow one, so it is still
    // holding pre-patch state when the second has already read, written and finished. The
    // first then writes its stale copy over the top.
    //
    // Equal delays do not reproduce this — the continuations run in order and each sees the
    // previous write — which is why an earlier version of this test passed with and without
    // the queue and proved nothing.
    loadDelays = [60, 5];
    const first = savePreferences({ language: "ta-IN" });
    const second = savePreferences({ location: "in-kl" });
    await Promise.all([first, second]);
    expect(profile()).toMatchObject({ language: "ta-IN", location: "in-kl" });
  });

  it("a failed write does not stall the ones after it", async () => {
    const boom = savePreferences({ language: "hi-IN" });
    await boom;
    await savePreferences({ location: "in-pb" });
    expect(profile()).toMatchObject({ language: "hi-IN", location: "in-pb" });
  });
});

describe("loadPreferences", () => {
  it("falls back to the defaults for a workspace that has set none", async () => {
    const p = await loadPreferences();
    expect(p.language).toBe("en-IN");
    expect(p.location).toBe("in");
    expect(p.analysed).toBe(false);
  });

  it("reports analysed only once a real business is there", async () => {
    await savePreferences({ language: "bn-IN" });
    expect((await loadPreferences()).analysed).toBe(false);
    store.current = { ...(store.current as object), profile: { ...(profile() as object), name: "Anna Traders" } };
    expect((await loadPreferences()).analysed).toBe(true);
  });
});
