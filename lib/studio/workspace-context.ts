"use client";

import { workspaceId, loadLocal } from "@/lib/store";
import type { WorkspaceProfile } from "@/lib/creative/studio-brief";

// What the studio already knows, fetched once per page load.
//
// The Composer mounts on five routes, and on /studio/create it remounts on every card
// click (Studio keys it on the pick). Each mount used to fire its own
// /api/social/dashboard request, so clicking through eight cards produced eight identical
// calls. These are module-level promises: the first caller starts the request, everyone
// after it awaits the same one, and a remount costs nothing.
//
// Deliberately not a React context or a store. Nothing here is mutable state — it is two
// read-only facts about the workspace, and a promise cache is the smallest thing that
// stops the duplication without adding a provider tree.

let accountsPromise: Promise<string[]> | null = null;
let profilePromise: Promise<WorkspaceProfile | null> | null = null;

/** Platforms with a connected account. Empty on any failure — never throws. */
export function connectedPlatforms(): Promise<string[]> {
  accountsPromise ??= fetch("/api/social/dashboard")
    .then((r) => r.json())
    .then((d) => {
      if (!d?.ok) return [];
      const accounts = d.accounts as { platform: string; status: string }[];
      return [...new Set(accounts.filter((a) => a.status === "connected").map((a) => a.platform))];
    })
    .catch(() => []);
  return accountsPromise;
}

/**
 * The analysed business, or null for a workspace that has never been analysed.
 *
 * Falls back to localStorage, which is not a nicety — localStorage is the source of truth in
 * `lib/store`, and /api/state is a best-effort sync that returns nothing at all when
 * DATABASE_URL is unset. Asking only the server meant that in local development, and in any
 * deployment without a database, every consumer of this helper believed the workspace had no
 * profile: the composer refused to hydrate the saved language and the publishing queue
 * announced English while the workspace was set to Marathi. Same order of precedence as
 * loadState() — server first, browser second — so all three surfaces agree.
 */
export function workspaceProfile(): Promise<WorkspaceProfile | null> {
  profilePromise ??= fetch(`/api/state?wsid=${encodeURIComponent(workspaceId())}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => (d?.state?.profile as WorkspaceProfile | undefined) ?? null)
    .catch(() => null)
    .then((p) => p ?? (loadLocal()?.profile as WorkspaceProfile | undefined) ?? null);
  return profilePromise;
}

/** Tests, and any place that genuinely needs to re-read after a change. */
export function resetWorkspaceContext(): void {
  accountsPromise = null;
  profilePromise = null;
}
