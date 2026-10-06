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

  it("keeps --faint readable on every dark surface, not just the darkest", () => {
    // Twice now a muted colour was chosen against black and then used on a panel, where
    // the lighter surface pulls it under AA. Black is the easy case; the raised control is
    // the one that decides the value.
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    const m = /--faint:\s*(#[0-9a-f]{6})/i.exec(css);
    expect(m, "--faint not found").toBeTruthy();
    const fg = lum(m![1]);
    // Every dark surface it is actually set against.
    for (const surface of ["#000000", "#0c100e", "#141916", "#1d231f"]) {
      expect(ratio(fg, lum(surface)), `${m![1]} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the signed-in pages outside /app are light too", () => {
  // /app/assistant and /worked are reached from the dashboard topbar but sit outside the
  // /app shell, so nothing gave them `.appui` and they rendered black between two white
  // pages. The class is the whole theme — without it every token below reverts to dark.
  for (const page of ["../app/app/assistant/Assistant.tsx", "../app/worked/page.tsx"]) {
    it(`${page.split("/").slice(-2).join("/")} opts into the light shell`, () => {
      const src = readFileSync(new URL(page, import.meta.url), "utf8");
      expect(src).toMatch(/className="appui"/);
    });
  }

  it("the early-access banner stays off the signed-in surfaces", () => {
    // It is a marketing bar. Showing it to someone already inside their own account reads
    // as an ad; /app was already excluded and these two were missed for the same reason
    // they missed `.appui` — they do not live under /app.
    const src = readFileSync(new URL("../app/components/EarlyAccessBanner.tsx", import.meta.url), "utf8");
    for (const route of ["/app", "/worked", "/account"]) {
      expect(src, `${route} still shows the banner`).toContain(`startsWith("${route}")`);
    }
  });
});

describe("green as a word, not a fill", () => {
  it("--green-ink clears AA on the lightest surface it lands on", () => {
    // Same split as --acc / --acc-ink. --green (#3ECF8E) is right as a fill and a status
    // dot and about 2:1 on white, so anywhere it is TEXT the light theme reads this.
    // Checked against #ffffff first: the lightest surface is the one that decides.
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    const m = /--green-ink:\s*(#[0-9a-f]{6})/i.exec(css);
    expect(m, "--green-ink not found").toBeTruthy();
    for (const surface of ["#ffffff", "#fafafa", "#f3f3f3"]) {
      expect(ratio(lum(m![1]), lum(surface)), `${m![1]} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the light overrides out-specify the rules they replace", () => {
    // `.appui .w-wordmark` would only TIE with `.worked .w-wordmark` (0,2,0 each) and win
    // on source order alone — which is how `.band` lost to `.landing section` before.
    for (const sel of [".appui .worked .w-wordmark", ".appui .worked .w-pos", ".appui .asst-status .asst-state"]) {
      expect(css, `${sel} missing`).toContain(sel);
    }
  });
});
