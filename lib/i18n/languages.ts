// The languages Populr can market in.
//
// One source of truth, and deliberately small. The codes are Sarvam's own
// (docs.sarvam.ai/api-reference/text/translate-text, verified Aug 2026) so nothing has to be
// mapped at the API boundary — a mapping table between our codes and theirs would be one
// more thing to keep in step for no benefit.
//
// Sarvam's translate endpoint accepts 22 scheduled languages. Listed here are the ones a
// business would plausibly market in today, plus English. Adding another is one row: the
// quality gate reads its behaviour from this table rather than from a switch statement, so
// nothing else has to change.

import type { Sql } from "@/lib/db";

export const LANGUAGES = {
  // ---- India. `sarvam: true` marks the set Sarvam's models are trained for; the provider
  // routing reads that flag rather than "is it English", which would have sent French to an
  // Indian-language model the moment this table grew past India.
  "en-IN": { name: "English",    native: "English",    script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: true  },
  "hi-IN": { name: "Hindi",      native: "हिन्दी",       script: "devanagari", terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },
  "mr-IN": { name: "Marathi",    native: "मराठी",       script: "devanagari", terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },
  "bn-IN": { name: "Bengali",    native: "বাংলা",        script: "bengali",    terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },
  "ta-IN": { name: "Tamil",      native: "தமிழ்",       script: "tamil",      terminator: ".", spaced: true,  dir: "ltr", sarvam: true  },
  "te-IN": { name: "Telugu",     native: "తెలుగు",       script: "telugu",     terminator: ".", spaced: true,  dir: "ltr", sarvam: true  },
  "kn-IN": { name: "Kannada",    native: "ಕನ್ನಡ",       script: "kannada",    terminator: ".", spaced: true,  dir: "ltr", sarvam: true  },
  "ml-IN": { name: "Malayalam",  native: "മലയാളം",     script: "malayalam",  terminator: ".", spaced: true,  dir: "ltr", sarvam: true  },
  "gu-IN": { name: "Gujarati",   native: "ગુજરાતી",      script: "gujarati",   terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },
  "pa-IN": { name: "Punjabi",    native: "ਪੰਜਾਬੀ",       script: "gurmukhi",   terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },
  // Verified present in Sarvam's documented source/target enum alongside the ten above
  // (docs.sarvam.ai/api-reference/text/translate-text). Odia takes the danda like the other
  // eastern Indo-Aryan scripts.
  "od-IN": { name: "Odia",       native: "ଓଡ଼ିଆ",        script: "odia",       terminator: "।", spaced: true,  dir: "ltr", sarvam: true  },

  // ---- Europe, the UK and the Americas. Latin script throughout, so the craft rules that
  // branch on script already treat these the way they treat English.
  "fr-FR": { name: "French",     native: "Français",   script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "de-DE": { name: "German",     native: "Deutsch",    script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "es-ES": { name: "Spanish",    native: "Español",    script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "pt-PT": { name: "Portuguese", native: "Português",  script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "pt-BR": { name: "Portuguese (Brazil)", native: "Português do Brasil", script: "latin", terminator: ".", spaced: true, dir: "ltr", sarvam: false },
  "it-IT": { name: "Italian",    native: "Italiano",   script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "nl-NL": { name: "Dutch",      native: "Nederlands", script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "pl-PL": { name: "Polish",     native: "Polski",     script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },

  // ---- Africa. Arabic is the one right-to-left entry here, which is why `dir` exists as a
  // field rather than an assumption: a surface that renders it left-to-right is broken, not
  // merely unstyled.
  "sw-KE": { name: "Swahili",    native: "Kiswahili",  script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "af-ZA": { name: "Afrikaans",  native: "Afrikaans",  script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "zu-ZA": { name: "Zulu",       native: "isiZulu",    script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "ha-NG": { name: "Hausa",      native: "Hausa",      script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "yo-NG": { name: "Yoruba",     native: "Yorùbá",     script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "am-ET": { name: "Amharic",    native: "አማርኛ",       script: "ethiopic",   terminator: "።", spaced: true,  dir: "ltr", sarvam: false },
  "ar-EG": { name: "Arabic",     native: "العربية",      script: "arabic",     terminator: ".", spaced: true,  dir: "rtl", sarvam: false },

  // ---- Southeast and East Asia. Thai, Japanese and Chinese do not put spaces between
  // words, which the craft rules read off `spaced` rather than counting them.
  "th-TH": { name: "Thai",       native: "ไทย",         script: "thai",       terminator: ".", spaced: false, dir: "ltr", sarvam: false },
  "id-ID": { name: "Indonesian", native: "Bahasa Indonesia", script: "latin", terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "vi-VN": { name: "Vietnamese", native: "Tiếng Việt",  script: "latin",      terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "ja-JP": { name: "Japanese",   native: "日本語",       script: "japanese",   terminator: "。", spaced: false, dir: "ltr", sarvam: false },
  "ko-KR": { name: "Korean",     native: "한국어",       script: "hangul",     terminator: ".", spaced: true,  dir: "ltr", sarvam: false },
  "zh-CN": { name: "Chinese",    native: "中文",         script: "han",        terminator: "。", spaced: false, dir: "ltr", sarvam: false },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type Language = (typeof LANGUAGES)[LanguageCode];

/** What Populr writes in unless told otherwise. */
export const DEFAULT_LANGUAGE: LanguageCode = "en-IN";

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && v in LANGUAGES;
}

/** Never throws: an unknown code falls back to English rather than failing a generation. */
export function language(code: string | null | undefined): Language {
  return isLanguageCode(code) ? LANGUAGES[code] : LANGUAGES[DEFAULT_LANGUAGE];
}

export function languageCode(code: string | null | undefined): LanguageCode {
  return isLanguageCode(code) ? code : DEFAULT_LANGUAGE;
}

/**
 * How a sentence ends in this language.
 *
 * The reason this table exists at all. Hindi, Marathi, Gujarati, Punjabi and Bengali end
 * sentences with the danda `।`, not a full stop — so a splitter that only knows `.!?`
 * returns an entire Hindi post as one sentence. Every check built on sentence count then
 * silently stops working: the monotone-shape rule sees one sentence and passes, the opener
 * length cap measures the whole post. The gate does not fail loudly, it disappears, on
 * exactly the content the founder cannot proofread.
 *
 * Latin punctuation stays in the pattern for every language because real Indian marketing
 * copy mixes both, often in the same line.
 */
export function sentenceSplitter(code: LanguageCode): RegExp {
  // language() rather than LANGUAGES[code]: this is exported, and a direct index throws on
  // a code that slipped past the type — which for a grader means a generation dies rather
  // than being graded in English.
  const l = language(code);
  // Unspaced scripts end sentences without a following space, so requiring one finds no
  // boundaries at all and the whole piece grades as a single sentence.
  if (!l.spaced) return /(?<=[。．.!?！？])\s*/;
  if (l.terminator === "।") return /(?<=[।.!?])\s+/;
  if (l.terminator === "።") return /(?<=[።.!?])\s+/;
  return /(?<=[.!?])\s+/;
}

/** True when Sarvam's models are trained for this language. */
export function servedBySarvam(code: LanguageCode): boolean {
  return language(code).sarvam;
}

/** Writing direction. Only Arabic is right-to-left today; the field exists so adding
 *  another is a table row rather than a hunt through every surface that renders text. */
export function direction(code: LanguageCode): "ltr" | "rtl" {
  return language(code).dir;
}

/**
 * For the UI: "Hindi (हिन्दी)", and just "English" where the two would repeat.
 *
 * Lives here rather than beside the translation client so that rendering a label does not
 * drag in a Sarvam HTTP client, its env handling and its fetch — which is what happened the
 * first time, when Studio imported it from localize.ts.
 */
export function localeLabel(code: LanguageCode): string {
  const l = language(code);
  return l.name === l.native ? l.name : `${l.name} (${l.native})`;
}

/** English is the only language whose phrase-level craft lists were written for it. */
export function isEnglish(code: LanguageCode): boolean {
  return code === "en-IN";
}

/**
 * The language a workspace has chosen, read server-side.
 *
 * The automated path has no browser to ask, so the preference has to come back out of the
 * same `workspaces.state.profile` the client wrote it to. Never throws and never returns
 * undefined: a missing row, an unreadable database or a code we no longer ship all mean
 * English, because a scheduled post going out in the wrong language is a worse failure
 * than one going out in the default.
 */
export async function getWorkspaceLanguage(sql: Sql | null, tenant: string): Promise<LanguageCode> {
  if (!sql || !tenant) return DEFAULT_LANGUAGE;
  try {
    const rows = (await sql`SELECT state FROM workspaces WHERE wsid = ${tenant}`) as
      { state?: { profile?: { language?: string } } }[];
    const lang = rows[0]?.state?.profile?.language;
    return isLanguageCode(lang) ? lang : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
