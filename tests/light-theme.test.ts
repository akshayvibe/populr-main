import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The light studio is a token override, and it only holds while that stays true.
//
// The failure mode is specific: a rule that hardcodes a dark literal, or colours text with
// the raw accent, renders invisibly on white and nothing errors. Lime on white measures
// about 1.14:1 — not dim, gone. These lock the two rules that keep that from happening.

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("the light studio is a token override", () => {
  it("accent-as-text resolves through --acc-text, never the raw accent", () => {
    // `background-color:` and `border-color:` legitimately keep the lime, so match only a
    // `color:` property — not any property ending in "color".
    const raw = css.match(/(?<![-a-zA-Z])color:\s*(var\(--acc\)|#d5ff72)/gi) ?? [];
    expect(raw, `${raw.length} rule(s) still colour text with the raw accent`).toHaveLength(0);
  });

  it("--acc-text is defined for both themes", () => {
    // Dark keeps the lime, so every existing dark surface renders exactly as it did.
    expect(css).toMatch(/--acc-text:\s*var\(--acc\)/);
    // Light borrows the ink that already passes AA on white.
    expect(css).toMatch(/--acc-text:\s*var\(--acc-ink\)/);
  });

  it("the page behind the shell is painted, not left dark", () => {
    // body is shared with the dark surfaces; without this the scrollbar gutter and any gap
    // below the shell show near-black through a white theme.
    expect(css).toMatch(/body:has\(\.studio-light\)\s*\{[^}]*background:\s*#ffffff/);
  });
});

describe("the shell decides which routes are light", () => {
  it("covers the whole studio rather than a hand-kept list", () => {
    const src = readFileSync(new URL("../app/studio/StudioShell.tsx", import.meta.url), "utf8");
    expect(src).toContain('path.startsWith("/studio/")');
    // A list of literal routes is what went stale last time a page was added.
    expect(src).not.toMatch(/LIGHT_ROUTES/);
  });
});
