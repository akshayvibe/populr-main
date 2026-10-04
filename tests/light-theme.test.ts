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

describe("the frosted surfaces are actually frosted", () => {
  it("declares backdrop-filter unprefixed only", () => {
    // The minifier treats `backdrop-filter` and `-webkit-backdrop-filter` as duplicates and
    // keeps the last one declared. With the prefixed form written second it kept that and
    // dropped the standard property — and Chrome ignores -webkit-backdrop-filter, so every
    // frosted surface silently became a flat translucent panel. The landing nav was the
    // visible one: page content scrolled straight through it, slicing headings in half.
    //
    // Modern Chrome and Safari both support the unprefixed property, so the prefix buys
    // nothing and costs the declaration it was meant to support.
    expect(css).not.toContain("-webkit-backdrop-filter");
    expect(css).toMatch(/[^-]backdrop-filter:\s*blur\(24px\)/);
  });

  it("keeps --faint readable on a true-black background", () => {
    // The dark background went to #000. --faint carries the plan card's "Skipped" labels
    // and every reason under them — the one piece of landing copy that has to be read for
    // the product to make sense — and the old value measured 4.09:1, under AA.
    const m = /--faint:\s*(#[0-9a-f]{6})/i.exec(css);
    expect(m, "--faint not found").toBeTruthy();
    const hex = m![1].slice(1);
    const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    expect((L + 0.05) / 0.05, `${m![1]} on black`).toBeGreaterThanOrEqual(4.5);
  });
});
