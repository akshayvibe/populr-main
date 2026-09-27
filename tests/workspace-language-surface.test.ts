import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_REGION, REGION_CODES, getWorkspaceRegion, getWorkspaceTimezone, isRegionCode, timezoneOf } from "@/lib/i18n/regions";

// Language and location are one field each on the workspace profile, written in one place
// and read by the server when unattended work runs.
//
// The failure mode is silent in both cases: the screen shows Marathi and the cron publishes
// English, or the screen says Asia/Kolkata and the queue schedules against UTC. Nothing
// errors, so these assert the contract instead.
//
// Named after behaviour, not local identifiers — an earlier version pinned one author's
// variable names and broke the first time the composer was rewritten.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const PREFS = "app/studio/preferences/page.tsx";

describe("one page owns both settings", () => {
  it("writes them onto the profile through saveState", () => {
    const src = read(PREFS);
    expect(src).toMatch(/import .*\bsaveState\b.*from "@\/lib\/store"/);
    // Written as a patch onto the existing profile, so neither setting clobbers the other
    // or any of the analysed fields around them.
    expect(src).toMatch(/profile:\s*\{\s*\.\.\.saved\.profile,\s*\.\.\.patch\s*\}/);
    expect(src).toMatch(/language\?:\s*LanguageCode/);
    expect(src).toMatch(/location\?:\s*RegionCode/);
  });

  it("the composer writes the same language field", () => {
    const src = read("app/studio/Composer.tsx");
    expect(src).toMatch(/import .*\bsaveState\b.*from "@\/lib\/store"/);
    expect(src).toMatch(/profile:\s*\{[^}]*language/);
  });

  it("both writers invalidate the profile cache, or the other surface goes stale", () => {
    for (const p of [PREFS, "app/studio/Composer.tsx"]) {
      expect(read(p), `${p} does not reset the profile cache`).toContain("resetWorkspaceContext");
    }
  });

  it("Settings no longer carries a second language editor", () => {
    // Two editors for one field is how the two drift apart.
    expect(read("app/studio/integrations/page.tsx")).not.toContain("LanguageSetting");
    expect(read("app/studio/StudioNav.tsx")).toContain("/studio/preferences");
  });

  it("every surface that mentions changing them points at that page", () => {
    expect(read("app/studio/social/page.tsx")).toContain("/studio/preferences");
  });
});

describe("the server reads the same two fields", () => {
  it("language comes out of profile.language", () => {
    const src = read("lib/i18n/languages.ts");
    expect(src).toContain("getWorkspaceLanguage");
    expect(src).toMatch(/state\?\:\s*\{\s*profile\?\:\s*\{\s*language\?\:/);
  });

  it("region comes out of profile.location", () => {
    const src = read("lib/i18n/regions.ts");
    expect(src).toMatch(/state\?\:\s*\{\s*profile\?\:\s*\{\s*location\?\:/);
  });

  it("neither reader throws, whatever the database does", async () => {
    // A scheduled post in the wrong language, or at the wrong hour, is a worse failure than
    // one on the default — so these return the default rather than propagating.
    await expect(getWorkspaceRegion(null, "ws1")).resolves.toBe(DEFAULT_REGION);
    await expect(getWorkspaceRegion(null, "")).resolves.toBe(DEFAULT_REGION);
    await expect(getWorkspaceTimezone(null, "ws1")).resolves.toBe(timezoneOf(DEFAULT_REGION));
  });
});

describe("the region table", () => {
  it("has no duplicates and every code passes its own guard", () => {
    expect(REGION_CODES.length).toBeGreaterThan(1);
    expect(new Set(REGION_CODES).size).toBe(REGION_CODES.length);
    expect(REGION_CODES.every(isRegionCode)).toBe(true);
    expect(isRegionCode("nowhere")).toBe(false);
    expect(isRegionCode(42)).toBe(false);
  });

  it("gives every region a resolvable IANA zone", () => {
    for (const code of REGION_CODES) {
      const tz = timezoneOf(code);
      // Throws on an invalid zone, which is the point: a typo here would schedule against
      // whatever the server's clock happens to be.
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0)).not.toThrow();
    }
  });

  it("defaults to India, which is who this is built for", () => {
    expect(timezoneOf(DEFAULT_REGION)).toBe("Asia/Kolkata");
    expect(timezoneOf(undefined)).toBe("Asia/Kolkata");
  });
});

describe("unattended publishing uses the workspace clock", () => {
  it("the agent path no longer hardcodes UTC", () => {
    const src = read("lib/agents/agents.ts");
    expect(src).toContain("getWorkspaceTimezone");
    expect(src).not.toMatch(/ctx\.now \+ 86_400_000,\s*"UTC"/);
  });

  it("the compose route falls back to the workspace region, not UTC", () => {
    const src = read("app/api/content/compose/route.ts");
    expect(src).toContain("getWorkspaceTimezone");
    // A browser-supplied timezone still wins: scheduling by hand means the clock in front
    // of the person doing it.
    expect(src).toMatch(/body\.timezone \|\| ""/);
  });
});

describe("the deployment story is written down", () => {
  it("SARVAM_API_KEY is documented as optional", () => {
    const env = read(".env.example");
    expect(env).toContain("SARVAM_API_KEY");
    expect(env.toLowerCase()).toMatch(/leaving this empty is safe/);
  });
});
