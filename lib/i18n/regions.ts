import type { Sql } from "@/lib/db";
import { DEFAULT_LANGUAGE, type LanguageCode } from "./languages";

// Where a business sells.
//
// Same shape as languages.ts on purpose — one table, a guard, a default, and a server-side
// reader — because the two settings are the same kind of fact about a workspace and a second
// pattern for the second one is how a codebase starts having two of everything.
//
// This exists for one concrete reason. Scheduling is timezone-aware, but the only caller that
// supplies a timezone reads it from `Intl.DateTimeFormat().resolvedOptions().timeZone` in the
// browser. The automation queue has no browser, so everything it publishes on its own was
// being scheduled against UTC — five and a half hours off for every Indian business we have.
// A region answers that without asking anyone to think about IANA strings.
//
// `languages` is a suggestion, never a rule. Someone in Maharashtra may well market in Hindi
// or English, and a setting that silently overrode that choice would be worse than one that
// offers it.

export const REGIONS = {
  "in":       { name: "All India",       timezone: "Asia/Kolkata",    languages: ["hi-IN", "en-IN"] },
  "in-mh":    { name: "Maharashtra",     timezone: "Asia/Kolkata",    languages: ["mr-IN", "hi-IN"] },
  "in-tn":    { name: "Tamil Nadu",      timezone: "Asia/Kolkata",    languages: ["ta-IN"] },
  "in-ka":    { name: "Karnataka",       timezone: "Asia/Kolkata",    languages: ["kn-IN"] },
  "in-wb":    { name: "West Bengal",     timezone: "Asia/Kolkata",    languages: ["bn-IN"] },
  "in-tg":    { name: "Telangana",       timezone: "Asia/Kolkata",    languages: ["te-IN"] },
  "in-ap":    { name: "Andhra Pradesh",  timezone: "Asia/Kolkata",    languages: ["te-IN"] },
  "in-gj":    { name: "Gujarat",         timezone: "Asia/Kolkata",    languages: ["gu-IN"] },
  "in-pb":    { name: "Punjab",          timezone: "Asia/Kolkata",    languages: ["pa-IN"] },
  "in-kl":    { name: "Kerala",          timezone: "Asia/Kolkata",    languages: ["ml-IN"] },
  "in-or":    { name: "Odisha",          timezone: "Asia/Kolkata",    languages: ["od-IN"] },
  "in-dl":    { name: "Delhi NCR",       timezone: "Asia/Kolkata",    languages: ["hi-IN", "en-IN"] },
  // Outside India the language table has nothing regional to offer, so these suggest English
  // and exist so a workspace elsewhere is not forced to schedule against the wrong clock.
  "ae":       { name: "UAE",             timezone: "Asia/Dubai",      languages: ["en-IN"] },
  "sg":       { name: "Singapore",       timezone: "Asia/Singapore",  languages: ["en-IN"] },
  "gb":       { name: "United Kingdom",  timezone: "Europe/London",   languages: ["en-IN"] },
  "us":       { name: "United States",   timezone: "America/New_York", languages: ["en-IN"] },
} as const satisfies Record<string, { name: string; timezone: string; languages: readonly LanguageCode[] }>;

export type RegionCode = keyof typeof REGIONS;
export type Region = (typeof REGIONS)[RegionCode];

/** India, because that is who this is built for. Never null — see getWorkspaceTimezone. */
export const DEFAULT_REGION: RegionCode = "in";

export const REGION_CODES = Object.keys(REGIONS) as RegionCode[];

export function isRegionCode(v: unknown): v is RegionCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REGIONS, v);
}

export function region(code: string | null | undefined): Region {
  return REGIONS[regionCode(code)];
}

export function regionCode(code: string | null | undefined): RegionCode {
  return isRegionCode(code) ? code : DEFAULT_REGION;
}

/** The IANA zone scheduling should use for this workspace. */
export function timezoneOf(code: string | null | undefined): string {
  return region(code).timezone;
}

/**
 * Languages worth offering for a region, most likely first.
 *
 * Used to suggest, never to set. The whole point of a separate language setting is that a
 * business decides who it is talking to, and geography is only a hint about that.
 */
export function suggestedLanguages(code: string | null | undefined): LanguageCode[] {
  return [...region(code).languages];
}

/** True when the region's usual language is already what the workspace writes in. */
export function languageMatchesRegion(lang: LanguageCode, code: string | null | undefined): boolean {
  const suggested = suggestedLanguages(code);
  return suggested.includes(lang) || lang === DEFAULT_LANGUAGE;
}

/**
 * The region a workspace sells to, read server-side.
 *
 * Mirrors getWorkspaceLanguage() exactly, including the refusal to throw: a missing row, an
 * unreadable database or a retired code all mean the default. A scheduled post going out at
 * the wrong hour is a worse failure than one going out on the default clock.
 */
export async function getWorkspaceRegion(sql: Sql | null, tenant: string): Promise<RegionCode> {
  if (!sql || !tenant) return DEFAULT_REGION;
  try {
    const rows = (await sql`SELECT state FROM workspaces WHERE wsid = ${tenant}`) as
      { state?: { profile?: { location?: string } } }[];
    const loc = rows[0]?.state?.profile?.location;
    return isRegionCode(loc) ? loc : DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

/** The timezone to schedule this workspace's unattended publishing in. */
export async function getWorkspaceTimezone(sql: Sql | null, tenant: string): Promise<string> {
  return timezoneOf(await getWorkspaceRegion(sql, tenant));
}
