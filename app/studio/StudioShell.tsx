"use client";

import { usePathname } from "next/navigation";
import StudioNav from "./StudioNav";

// The studio shell, and where the Content Engine's light theme is switched on.
//
// The whole light treatment is a token override — `.studio-light` redefines --bg, --panel,
// --fg and the rest, and every existing rule that already reads those variables follows
// without being rewritten. That is why this is one class rather than a parallel stylesheet:
// a second design system layered over the first is what produced the shadowed-rule bugs in
// the last two passes.
//
// It started scoped to the creation surfaces, with the note that converting the rest was a
// separate decision about the whole product. That decision has been made: the studio is
// light throughout. Two surfaces next to each other in opposite treatments read as two
// products, and the nav rail sits against every one of them.
//
// Still a class rather than a stylesheet, and still the same token override — which is the
// reason this is a small change rather than a rewrite. Anything that reads --bg, --panel,
// --fg or --line already follows. What does not follow is anything that hardcoded a dark
// literal, and those are corrected at their own rules rather than by patching over them
// here.
//
// `usePathname` runs during SSR too, so the class is in the first HTML the browser parses
// and there is no flash of the dark theme before hydration.

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const light = path === "/studio" || path.startsWith("/studio/");

  return (
    <div className={"studio" + (light ? " studio-light" : "")}>
      <StudioNav />
      <main className="st-main">{children}</main>
    </div>
  );
}
