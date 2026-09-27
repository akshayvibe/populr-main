import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The language setting is only worth having if every writer agrees on one field.
//
// `profile.language` is written by the composer and by Settings, and read server-side by
// getWorkspaceLanguage() when a queued slot comes due. Three places, one field. If any of
// them drifts onto its own key the failure is silent: the UI shows Marathi and the cron
// publishes English, and nothing errors.
//
// These assert the contract rather than any one author's variable names — the earlier
// version of this test pinned local identifiers and broke the first time the composer was
// rewritten, which taught us nothing except not to do that.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("one field holds the workspace language", () => {
  it("Settings writes it onto profile.language", () => {
    const src = read("app/studio/integrations/LanguageSetting.tsx");
    expect(src).toMatch(/import .*\bsaveState\b.*from "@\/lib\/store"/);
    expect(src).toMatch(/profile:\s*\{[^}]*language/);
  });

  it("the composer writes the same field", () => {
    const src = read("app/studio/Composer.tsx");
    expect(src).toMatch(/import .*\bsaveState\b.*from "@\/lib\/store"/);
    expect(src).toMatch(/profile:\s*\{[^}]*language/);
  });

  it("the server reads that field and nothing else", () => {
    const src = read("lib/i18n/languages.ts");
    expect(src).toContain("getWorkspaceLanguage");
    // The column is workspaces.state, and the path into it is profile.language.
    expect(src).toMatch(/state\?\:\s*\{\s*profile\?\:\s*\{\s*language\?\:/);
  });

  it("both writers invalidate the profile cache, or the other surface goes stale", () => {
    // workspaceProfile() memoises per page load. A writer that does not reset it leaves the
    // other surface showing the previous language until a full reload.
    for (const p of ["app/studio/integrations/LanguageSetting.tsx", "app/studio/Composer.tsx"]) {
      expect(read(p), `${p} does not reset the profile cache`).toContain("resetWorkspaceContext");
    }
  });
});

describe("the surfaces that spend the setting say so", () => {
  it("Settings offers a Language section", () => {
    const src = read("app/studio/integrations/page.tsx");
    expect(src).toContain("LanguageSetting");
    expect(src).toMatch(/id:\s*"language"/);
  });

  it("Publishing states the language the queue will use", () => {
    const src = read("app/studio/social/page.tsx");
    expect(src).toContain("localeLabel");
    // Unattended publishing is the case where nobody sees the output first, so the queue
    // has to name its language rather than leave it implied.
    expect(src).toMatch(/studio\/integrations/);
  });

  it("the automated path reads the language at run time", () => {
    const src = read("lib/automation/sources.ts");
    expect(src).toContain("getWorkspaceLanguage");
    // Passed into generation, not merely fetched.
    expect(src).toMatch(/\blanguage\b\s*,/);
  });
});

describe("the deployment story is written down", () => {
  it("SARVAM_API_KEY is documented as optional", () => {
    const env = read(".env.example");
    expect(env).toContain("SARVAM_API_KEY");
    // Someone reading this file must be able to tell that leaving it empty is safe.
    expect(env.toLowerCase()).toMatch(/leaving this empty is safe/);
  });
});
