"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

type Choice = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

/** Subscribers in this tab. `storage` events only fire in the *other* tabs. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` throws — some privacy modes and embedded
 * webviews do. The choice then applies for the session but does not persist.
 */
let memoryFallback: Choice | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return memoryFallback ?? "system";
  }
}

/**
 * The server has no `localStorage`, so "system" is the only honest value it
 * can render. `useSyncExternalStore` swaps in the real one after hydration
 * without a `setState` in an effect.
 */
function getServerSnapshot(): Choice {
  return "system";
}

/**
 * Light / dark / system.
 *
 * "System" is not a third stamped value — it REMOVES `data-theme` so the
 * `prefers-color-scheme` block in globals.css becomes authoritative again.
 * Writing `data-theme="system"` instead would match neither branch of the
 * `dark` variant and silently pin the user to light.
 */
export function ThemeToggle() {
  const t = useTranslations("a11y");
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function apply(next: string) {
    const value = next as Choice;

    try {
      if (value === "system") {
        localStorage.removeItem(STORAGE_KEY);
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem(STORAGE_KEY, value);
        document.documentElement.dataset.theme = value;
      }
    } catch {
      memoryFallback = value;
      if (value === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
    }

    for (const listener of listeners) listener();
  }

  return (
    <SegmentedControl
      label={t("theme")}
      value={choice}
      onValueChange={apply}
      options={[
        { value: "light", label: t("themeLight") },
        { value: "dark", label: t("themeDark") },
        { value: "system", label: t("themeSystem") },
      ]}
    />
  );
}
