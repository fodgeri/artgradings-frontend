import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for Next's navigation APIs. Always import `Link`,
 * `useRouter`, `redirect` and `usePathname` from here rather than from
 * `next/link` / `next/navigation` — these keep the active locale in the URL
 * automatically, so no component ever hand-builds a `/${locale}/...` path.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
