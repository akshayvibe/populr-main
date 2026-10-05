import { describe, expect, it } from "vitest";
import { routeGeneration, normalizeLanguage } from "@/lib/services/model-router";
import { PROVIDERS } from "@/lib/services/llm";
import { LANGUAGE_CODES, servedBySarvam } from "@/lib/i18n/languages";

// The router decides WHERE a generation runs. These pin the decision, not the generation —
// nothing here makes a provider call.
//
// The property worth protecting is that the router never learns a provider's name. Every
// rule below should keep passing when a provider is added to PROVIDERS, and fail only when
// the capability table genuinely changes.

const sarvam = () => PROVIDERS.find((p) => p.name === "sarvam")!;

describe("language normalisation", () => {
  it("resolves the forms a caller actually has", () => {
    // Our own code, a bare subtag, and the casing nobody controls.
    expect(normalizeLanguage("mr-IN")).toBe("mr-IN");
    expect(normalizeLanguage("mr")).toBe("mr-IN");
    expect(normalizeLanguage("MR-in")).toBe("mr-IN");
    expect(normalizeLanguage("mr_IN")).toBe("mr-IN");
    for (const base of ["en", "hi", "gu"]) {
      expect(normalizeLanguage(base), base).toBe(`${base}-IN`);
    }
  });

  it("falls back to the default rather than throwing", () => {
    // A stale client sending a retired code must still get a post.
    expect(normalizeLanguage("zz")).toBe("en-IN");
    expect(normalizeLanguage("")).toBe("en-IN");
    expect(normalizeLanguage(undefined)).toBe("en-IN");
  });
});

describe("routing by capability", () => {
  it("prefers the trained provider for a regional language, in both modes", () => {
    // The product decision this encodes: the surface where someone is watching is the one
    // surface that must not quietly stop writing native Marathi.
    for (const mode of ["interactive", "background"] as const) {
      const d = routeGeneration({ language: "mr-IN", mode });
      expect(d.preferProvider, mode).toBe("sarvam");
      expect(d.reason, mode).toContain(mode);
    }
  });

  it("expresses no preference for English", () => {
    for (const mode of ["interactive", "background"] as const) {
      expect(routeGeneration({ language: "en-IN", mode }).preferProvider).toBeUndefined();
    }
  });

  it("expresses no preference for a language nobody specialises in", () => {
    // French and Thai are supported and no provider claims them. The declared chain order
    // is as good an answer as any — and better than sending them to an Indic model.
    for (const code of ["fr-FR", "th-TH"] as const) {
      const d = routeGeneration({ language: code, mode: "background" });
      expect(d.preferProvider, code).toBeUndefined();
      expect(d.reason, code).toContain("no_specialist");
    }
  });

  it("routes every language the table says Sarvam serves, and no others", () => {
    // Reads the capability table rather than a hardcoded list, so adding a language to
    // Sarvam's set changes this test's expectations automatically — which is the point.
    for (const code of LANGUAGE_CODES) {
      const pref = routeGeneration({ language: code, mode: "background" }).preferProvider;
      const expected = servedBySarvam(code) && code !== "en-IN";
      expect(Boolean(pref), code).toBe(expected);
    }
  });
});

describe("an explicit choice", () => {
  it("is honoured when the provider can serve the request", () => {
    const d = routeGeneration({ language: "mr-IN", mode: "interactive", preferProvider: "sarvam" });
    expect(d.preferProvider).toBe("sarvam");
    expect(d.reason).toContain("explicit");
  });

  it("is not silently replaced by the language rule", () => {
    // Groq declares no languages, so it is general purpose and can serve anything. A
    // caller that asked for it gets it, even for Marathi.
    const d = routeGeneration({ language: "mr-IN", mode: "background", preferProvider: "groq" });
    expect(d.preferProvider).toBe("groq");
  });

  it("is refused when a specialist is asked for outside its languages", () => {
    // Sending French to an Indian-language model is a caller mistake. Dropping the
    // preference lets the chain answer instead of burning the primary slot.
    const d = routeGeneration({ language: "fr-FR", mode: "background", preferProvider: "sarvam" });
    expect(d.preferProvider).toBeUndefined();
    expect(d.reason).toContain("cannot_serve");
  });
});

describe("determinism and defaults", () => {
  it("returns the same decision for the same request", () => {
    const once = routeGeneration({ language: "mr-IN", mode: "background" });
    const twice = routeGeneration({ language: "mr-IN", mode: "background" });
    expect(once).toEqual(twice);
  });

  it("an empty request is a no-opinion decision", () => {
    expect(routeGeneration().preferProvider).toBeUndefined();
    expect(routeGeneration({}).preferProvider).toBeUndefined();
  });
});

describe("the capability table is the source of truth", () => {
  it("Sarvam keeps its measured budget and timeout", () => {
    // These are the numbers a live call established. Losing them returns content: null.
    expect(sarvam().capabilities.maxOutputTokens).toBe(12_288);
    expect(sarvam().capabilities.timeoutMs).toBe(120_000);
    expect(sarvam().capabilities.latencyClass).toBe("slow");
  });

  it("Sarvam's language set is not a second copy of the language table", () => {
    expect([...(sarvam().capabilities.languages ?? [])])
      .toEqual(LANGUAGE_CODES.filter(servedBySarvam));
  });

  it("the general-purpose providers declare no languages and keep the shared limits", () => {
    for (const name of ["groq", "gemini", "openai"] as const) {
      const p = PROVIDERS.find((x) => x.name === name)!;
      expect(p.capabilities.languages, name).toBeUndefined();
      // Undefined means "use the shared value" — a provider that quietly gained its own
      // budget would be a behaviour change nobody asked for.
      expect(p.capabilities.maxOutputTokens, name).toBeUndefined();
      expect(p.capabilities.timeoutMs, name).toBeUndefined();
    }
  });
});
