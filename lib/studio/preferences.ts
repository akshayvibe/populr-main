"use client";

import { loadState, saveState, type Profile } from "@/lib/store";
import { resetWorkspaceContext } from "./workspace-context";
import { DEFAULT_LANGUAGE, type LanguageCode } from "@/lib/i18n/languages";
import { DEFAULT_REGION, type RegionCode } from "@/lib/i18n/regions";

// Reading and writing the two workspace preferences.
//
// Extracted because two screens set them — the welcome page on a first visit and
// /studio/preferences afterwards — and the write is not a one-liner. It has to patch the
// existing profile without clobbering the analysed fields, create one when there is none,
// and invalidate the page-load profile cache. Two copies of that is two chances to get the
// last step wrong, and getting it wrong is silent: the other screen keeps showing the old
// value until a full reload.

export type Preferences = { language: LanguageCode; location: RegionCode };

/**
 * Writes run one at a time.
 *
 * savePreferences reads the current state, patches it and writes it back, with an await in
 * the middle. Two calls overlapping in that gap both read the pre-patch state and the second
 * writes it back, silently reverting the first — pick a language, pick a region, lose the
 * language.
 *
 * It barely reproduces in development because /api/state answers instantly with no database
 * configured, which makes the window about zero. Production has a database, and the window
 * becomes the round trip: comfortably wider than two ordinary clicks. Chaining is cheaper
 * than the bug report.
 */
let queue: Promise<void> = Promise.resolve();

/**
 * An empty profile carrying only the preferences.
 *
 * Used on a first visit, where someone picks a language before Populr has analysed
 * anything. Every text field is empty on purpose: `hasProfile` is `!!(name || oneLiner)`,
 * so this is still correctly treated as "no business analysed yet" everywhere that asks,
 * while giving getWorkspaceLanguage() somewhere to read from.
 */
function stubProfile(): Profile {
  return { name: "", oneLiner: "", audience: "", positioning: "", competitors: [], voice: "", description: "" };
}

/** Current preferences, falling back to the defaults for a workspace that has set none. */
export async function loadPreferences(): Promise<Preferences & { analysed: boolean }> {
  const { saved } = await loadState();
  const p = saved?.profile;
  return {
    language: p?.language ?? DEFAULT_LANGUAGE,
    location: p?.location ?? DEFAULT_REGION,
    // Whether a real business has been analysed, by the same test the rest of the app uses.
    analysed: !!(p?.name || p?.oneLiner),
  };
}

/**
 * Write one or both preferences.
 *
 * Patches rather than replaces, so setting a language cannot drop a location or any of the
 * analysed fields around them. Creates a profile when none exists rather than refusing —
 * the welcome page runs before anything has been analysed, and asking someone to add a site
 * before they can choose a language is the wrong order.
 */
export function savePreferences(patch: Partial<Preferences>): Promise<void> {
  queue = queue
    .catch(() => {})            // one failed write must not stall every later one
    .then(async () => {
      const { saved } = await loadState();
      const base = saved ?? { url: "", profile: null, competitors: [], chat: [], drafts: [] };
      saveState({ ...base, profile: { ...(base.profile ?? stubProfile()), ...patch } });
      // The profile promise is memoised per page load and the composer reads it on mount.
      resetWorkspaceContext();
    });
  return queue;
}
