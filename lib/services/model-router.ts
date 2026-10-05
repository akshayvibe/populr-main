import { PROVIDERS, type ProviderName } from "./llm";
import { LANGUAGE_CODES, languageCode, isEnglish, type LanguageCode } from "@/lib/i18n/languages";

// Where to generate. Not how.
//
// This is deliberately the smallest thing that can hold one real rule — regional language
// goes to the provider trained for it — without that rule being an `if` on a provider name
// somewhere in the content layer, which is where it lived before.
//
// The split it preserves:
//
//   routeGeneration()  decides WHERE        (this file)
//   generateText()     decides HOW          (llm.ts: chain, retries, cache, fallback)
//   capabilities       declare WHAT         (llm.ts: PROVIDERS[].capabilities)
//
// So a new provider is a row in PROVIDERS. Nothing here learns its name. The router reads
// `capabilities.languages` and asks "who is trained for this?", which is a question whose
// answer changes when the table changes and never when this file changes.
//
// It returns a PREFERENCE, never a restriction. generateText sorts the chain by it and
// leaves every other provider reachable behind it, so a routing decision can be wrong
// without a request failing — which is the property that makes it safe to keep this simple.

export type GenerationMode = "interactive" | "background";

export type GenerationRequest = {
  /** What the output should be written in. The caller knows; we never guess. */
  language?: string;
  /** Whether somebody is waiting. See the note on quality in `routeGeneration`. */
  mode?: GenerationMode;
  /** A caller that has already decided. Honoured when the provider can serve the request. */
  preferProvider?: ProviderName;
};

export type RoutingDecision = {
  /** Undefined means "no opinion" — generateText uses its declared chain order. */
  preferProvider?: ProviderName;
  /**
   * Why, in a form that can be logged next to the result.
   *
   * The question this exists to answer is "why did this request use Sarvam?", asked weeks
   * later by someone reading logs who cannot see the prompt and should not need to.
   */
  reason: string;
};

/**
 * One normalised language code.
 *
 * Callers hand us whatever they have: our own "mr-IN", a bare "mr", a display name, or the
 * native spelling. Routing has to treat those as one thing or the rule silently stops
 * matching for half its callers.
 *
 * Deliberately not language *detection*. This maps a label a caller already knows onto a
 * code; working out the language of a piece of text is a different problem and not one
 * routing should be guessing at.
 */
export function normalizeLanguage(input: string | null | undefined): LanguageCode {
  const raw = (input || "").trim();
  if (!raw) return languageCode(undefined);

  // Our own codes, exactly.
  const exact = LANGUAGE_CODES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  // A bare subtag — "mr", "mr_IN", "mr-in". First match wins, and the table is ordered
  // with the Indian set first, so "en" resolves to en-IN rather than a later variant.
  const base = raw.toLowerCase().replace("_", "-").split("-")[0];
  const bySubtag = LANGUAGE_CODES.find((c) => c.toLowerCase().startsWith(`${base}-`));
  if (bySubtag) return bySubtag;

  return languageCode(undefined);
}

/** Providers declaring they are trained for this language, in chain order. */
function providersFor(code: LanguageCode): ProviderName[] {
  return PROVIDERS
    .filter((p) => p.capabilities.languages?.includes(code))
    .map((p) => p.name);
}

const byName = (name: ProviderName) => PROVIDERS.find((p) => p.name === name);

/**
 * Pick a provider preference for one generation.
 *
 * Today there is exactly one rule worth having, and pretending otherwise would be building
 * a scoring framework for a single comparison:
 *
 *   a language some provider is specifically trained for  →  prefer that provider
 *
 * Mode is carried and logged but does not currently change the answer, and that is a
 * product decision rather than an oversight. Sarvam takes about fifty seconds, so the
 * obvious move is to send interactive Marathi to a fast general-purpose model instead —
 * which would mean the one surface where a founder is actually watching is the one surface
 * that does not get native Marathi. That trades away the thing the feature exists for, so
 * the latency is handled in the UI rather than by quietly changing who writes.
 *
 * When there are real latency measurements for every provider, this is where a
 * quality-versus-wait rule would go. It is not where a guess should go.
 */
export function routeGeneration(req: GenerationRequest = {}): RoutingDecision {
  const code = normalizeLanguage(req.language);
  const capable = providersFor(code);

  // 1. An explicit choice, honoured unless the provider cannot serve the request.
  if (req.preferProvider) {
    const p = byName(req.preferProvider);
    if (!p) return { reason: `explicit:${req.preferProvider}:unknown` };
    // A specialist asked for outside its languages is a mistake worth not making silently.
    const specialist = p.capabilities.languages;
    if (specialist && !specialist.includes(code)) {
      return { reason: `explicit:${req.preferProvider}:cannot_serve:${code}` };
    }
    return { preferProvider: req.preferProvider, reason: `explicit:${req.preferProvider}` };
  }

  // 2. English is what the general-purpose chain is already good at, and every provider
  //    answers it. Expressing a preference here would only reorder equals.
  if (isEnglish(code)) return { reason: `default:english:${code}` };

  // 3. A language somebody is actually trained for.
  if (capable.length > 0) {
    return { preferProvider: capable[0], reason: `language:${code}:${req.mode ?? "unspecified"}` };
  }

  // 4. A language we support but nobody specialises in — French, Thai, Swahili. The chain
  //    order is as good an answer as any, and better than inventing a reason.
  return { reason: `default:no_specialist:${code}` };
}
