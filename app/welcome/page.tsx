"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPreferences, savePreferences } from "@/lib/studio/preferences";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, LANGUAGES, localeLabel, isEnglish, type LanguageCode } from "@/lib/i18n/languages";
import { DEFAULT_REGION, REGION_CODES, REGIONS, timezoneOf, suggestedLanguages, languageMatchesRegion, type RegionCode } from "@/lib/i18n/regions";

// The first screen.
//
// Two questions, both of which change what the product does on day one, and neither of
// which Populr can work out on its own. Everything else it infers from the site.
//
// Deliberately not a wizard. There is no progress bar, no four steps, and nothing is
// required — a preference already has a defensible default, so a first visit that ends in
// someone pressing Continue straight away is a good outcome rather than an abandoned funnel.
//
// It also runs before anything has been analysed, which is the whole reason savePreferences
// creates a profile rather than refusing. Asking for a website before letting someone choose
// the language they read in is the wrong order.

const STEPS = [
  { t: "It reads your business", d: "Your site, your positioning, who you sell to — once, then it stops asking." },
  { t: "It decides what is worth doing", d: "A small number of things each week, and a written reason for everything it skips." },
  { t: "It writes and publishes", d: "In your language, on your clock, including while you are doing something else." },
];

export default function WelcomePage() {
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [location, setLocation] = useState<RegionCode | null>(null);
  const [saving, setSaving] = useState(false);
  /** Thirty-one language chips is a wall, not a choice. See `shownLanguages`. */
  const [allLangs, setAllLangs] = useState(false);
  const [allRegions, setAllRegions] = useState(false);

  useEffect(() => {
    let live = true;
    void loadPreferences().then((p) => {
      if (!live) return;
      setLanguage(p.language);
      setLocation(p.location);
    });
    return () => { live = false; };
  }, []);

  // Saved as they are chosen, not held until Continue. Someone who closes the tab half way
  // through has still told us something true, and losing it would mean asking twice.
  const pickLanguage = useCallback((next: LanguageCode) => {
    setLanguage(next);
    void savePreferences({ language: next });
  }, []);

  const pickLocation = useCallback((next: RegionCode) => {
    setLocation(next);
    // Offer the region's usual language, but only when the person has not already chosen
    // something other than the default — a click on "Tamil Nadu" should never silently undo
    // a deliberate choice of Hindi.
    void savePreferences({ location: next });
  }, []);

  const go = useCallback(async () => {
    setSaving(true);
    // Everything is already persisted; this only guarantees the last click landed before
    // the navigation, since saveState debounces its server write.
    await savePreferences({});
    window.location.href = "/app";
  }, []);

  // A short list first, the full table behind a click.
  //
  // The table grew from eleven to thirty-one, and rendering all of it put a wall of chips
  // in front of the first question anyone is asked. What a person needs on this screen is
  // the handful plausible for where they sell, plus a way to reach the rest — not proof
  // that we support Yoruba.
  const shownLanguages = useMemo(() => {
    if (allLangs) return LANGUAGE_CODES;
    const near = location ? suggestedLanguages(location) : [];
    // Current pick always present, or the selected chip would vanish when the list shortens.
    const short = [...new Set([DEFAULT_LANGUAGE, ...near, ...(language ? [language] : [])])];
    return LANGUAGE_CODES.filter((c) => short.includes(c));
  }, [allLangs, location, language]);

  // Same treatment for regions. Seventeen chips is a scroll on a phone, and the first four
  // cover most of who this is for.
  const shownRegions = useMemo(() => {
    if (allRegions) return REGION_CODES;
    const short = new Set([DEFAULT_REGION, ...(location ? [location] : []), "in-mh", "in-tn", "in-ka"]);
    return REGION_CODES.filter((c) => short.has(c));
  }, [allRegions, location]);

  const ready = language !== null && location !== null;
  // Only when the region genuinely points elsewhere. Someone who picked Marathi for
  // Maharashtra has already chosen its primary language, and offering them Hindi as "what
  // businesses there usually use" reads as a correction of a correct answer.
  const mismatched = ready && !languageMatchesRegion(language, location);
  const suggested = mismatched ? suggestedLanguages(location).filter((c) => c !== language) : [];

  return (
    <main className="wel">

      <div className="wel-inner">
        <header className="wel-head">
          <div className="wel-brand">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M21.4 2.6c.63-.22 1.22.37 1 1L15.6 21.5c-.3.85-1.5.83-1.77-.03l-2.4-7.3-7.3-2.4c-.86-.28-.88-1.48-.03-1.77z" fill="currentColor" />
            </svg>
            <span>Populr</span>
          </div>
          <h1 className="wel-h1">Welcome. <em>Two questions first.</em></h1>
          <p className="wel-sub">
            Populr works out the rest from your website. These two it cannot guess, and both
            change what it does from the first day.
          </p>
        </header>

        <section className="wel-card">
          <div className="wel-q">
            <div className="wel-q-head">
              <h2>What language do you sell in?</h2>
              <p>Everything is written natively in it — not translated from English afterwards.</p>
            </div>
            <div className="wel-opts" role="group" aria-label="Marketing language">
              {shownLanguages.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"wel-opt" + (language === c ? " on" : "")}
                  aria-pressed={language === c}
                  onClick={() => pickLanguage(c)}
                >
                  <b>{isEnglish(c) ? "English" : LANGUAGES[c].native}</b>
                  {!isEnglish(c) && <span>{LANGUAGES[c].name}</span>}
                </button>
              ))}
              {!allLangs && (
                <button type="button" className="wel-opt wel-more" onClick={() => setAllLangs(true)}>
                  <b>All {LANGUAGE_CODES.length} languages</b>
                </button>
              )}
            </div>
          </div>

          <div className="wel-q">
            <div className="wel-q-head">
              <h2>Where do you sell?</h2>
              <p>This sets the clock your publishing runs on, so a post set for 9am goes out at 9am.</p>
            </div>
            <div className="wel-opts" role="group" aria-label="Where you sell">
              {shownRegions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"wel-opt wel-opt-wide" + (location === c ? " on" : "")}
                  aria-pressed={location === c}
                  onClick={() => pickLocation(c)}
                >
                  <b>{REGIONS[c].name}</b>
                </button>
              ))}
              {!allRegions && (
                <button type="button" className="wel-opt wel-opt-wide wel-more" onClick={() => setAllRegions(true)}>
                  <b>All {REGION_CODES.length} places</b>
                </button>
              )}
            </div>
            {ready && (
              <p className="wel-tz">
                Publishing on <b>{timezoneOf(location)}</b>.
                {mismatched && suggested.length > 0 && (
                  <>
                    {" "}Businesses there usually market in{" "}
                    <button className="wel-swap" onClick={() => pickLanguage(suggested[0])}>
                      {localeLabel(suggested[0])}
                    </button>
                    {" — "}your choice stands either way.
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        {/* What happens next, said before it happens. The next screen asks for a website,
            and arriving there without being told is how an onboarding loses people. */}
        <section className="wel-next">
          <p className="label">Then Populr gets to work</p>
          <ol className="wel-steps">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="wel-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="wel-st"><b>{s.t}</b><em>{s.d}</em></span>
              </li>
            ))}
          </ol>
        </section>

        <div className="wel-go-row">
          <button className="wel-go" onClick={go} disabled={!ready || saving}>
            {saving ? "Taking you in…" : "Continue"}
          </button>
          <p className="wel-note">
            {ready
              ? <>Writing in {localeLabel(language)}, publishing on {timezoneOf(location)}. Both changeable any time in Preferences.</>
              : "Loading your workspace…"}
          </p>
        </div>
      </div>
    </main>
  );
}
