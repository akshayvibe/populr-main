"use client";

import { useCallback, useEffect, useState } from "react";
import { loadState, saveState } from "@/lib/store";
import { resetWorkspaceContext } from "@/lib/studio/workspace-context";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, localeLabel, type LanguageCode } from "@/lib/i18n/languages";

// The language the workspace markets in.
//
// This setting used to live only in the composer's Options panel, which was defensible while
// it affected one post at a time. It is not defensible now: the same preference decides what
// the automation queue generates, and queued work goes out without anyone opening the
// composer. A setting that governs unattended publishing does not belong behind a disclosure
// on a different screen.
//
// It writes to `profile.language` on the saved workspace state — the same field
// getWorkspaceLanguage() reads server-side when a scheduled slot comes due. One field, one
// writer, read by both the browser and the cron.

export default function LanguageSetting() {
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** A workspace that has never been analysed has no profile to write the language onto. */
  const [noProfile, setNoProfile] = useState(false);

  // Read through loadState(), the same source the write uses.
  //
  // Reading through workspaceProfile() instead looked equivalent and was not: that helper
  // only asks the server, so with no database configured it found nothing and this control
  // disabled itself — while the write path, which falls back to localStorage, would have
  // saved perfectly well. Read and write must agree on where the profile lives.
  useEffect(() => {
    let live = true;
    void loadState().then(({ saved }) => {
      if (!live) return;
      if (!saved?.profile) { setNoProfile(true); setLanguage(DEFAULT_LANGUAGE); return; }
      setLanguage(saved.profile.language ?? DEFAULT_LANGUAGE);
    });
    return () => { live = false; };
  }, []);

  const change = useCallback(async (next: LanguageCode) => {
    setLanguage(next);
    setSaving(true);
    setSaved(false);
    try {
      const { saved: state } = await loadState();
      if (!state?.profile) { setNoProfile(true); return; }
      saveState({ ...state, profile: { ...state.profile, language: next } });
      // The page-load profile cache now holds a stale language, and the composer reads from
      // it on mount. Without this the composer would show the old language until reload.
      resetWorkspaceContext();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, []);

  if (language === null) {
    return <p className="lang-note">Loading…</p>;
  }

  return (
    <div className="lang-set">
      <label className="lang-field">
        <span className="lang-label">Marketing language</span>
        <select
          id="workspace-language"
          className="cmp-select lang-select"
          value={language}
          disabled={noProfile}
          onChange={(e) => void change(e.target.value as LanguageCode)}
        >
          {LANGUAGE_CODES.map((c) => (
            <option key={c} value={c}>{localeLabel(c)}</option>
          ))}
        </select>
      </label>

      <p className="lang-note" aria-live="polite">
        {noProfile
          ? <>Populr has not analysed a business yet. <a href="/app">Add your site</a> first — the language is stored on the business profile.</>
          : saving ? "Saving…"
          : saved ? `Saved. New content will be written in ${localeLabel(language)}.`
          : "Everything Populr writes uses this — posts you create here, and anything the queue publishes on its own."}
      </p>

      {/* Stated rather than implied. Someone switching to Marathi is entitled to know this
          changes unattended publishing, not just the next thing they type. */}
      <ul className="lang-facts">
        <li>Content is written natively in this language, not translated from English afterwards.</li>
        <li>Scheduled and automated posts use whatever this is set to when they run, not when they were queued.</li>
        <li>Product names, URLs and English technical terms are kept as they are.</li>
      </ul>
    </div>
  );
}
