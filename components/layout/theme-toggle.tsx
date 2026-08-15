"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/** Subscribers in this tab. `storage` events only fire in the *other* tabs. */
const listeners = new Set<() => void>();

/**
 * Used only when `localStorage` throws — some privacy modes and embedded
 * webviews do. The choice then applies for the session but does not persist.
 */
let memoryFallback: Theme | null = null;

/**
 * Dark is the only stamped value: light is the ABSENCE of `data-theme`, so the
 * default state of the document is also the default state of the toggle and
 * there is only ever one way to be light.
 */
function stamp(value: Theme) {
  if (value === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  /**
   * A `storage` event means another tab changed the choice, so this tab has to
   * repaint as well as re-render — nothing else stamps the document here.
   * `key` is null when the whole store was cleared, which is a change too.
   */
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    stamp(getSnapshot());
    onChange();
  }

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Light is the default. Only an explicit "dark" moves off it — anything else
 * in storage, including junk, reads as light.
 */
function getSnapshot(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return memoryFallback ?? "light";
  }
}

/**
 * The server has no `localStorage`, and light is the default, so this matches
 * what the server actually rendered. `useSyncExternalStore` swaps in the real
 * value after hydration without a `setState` in an effect.
 */
function getServerSnapshot(): Theme {
  return "light";
}

/** Light / dark. */
export function ThemeToggle() {
  const t = useTranslations("a11y");
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function apply(next: string) {
    const value: Theme = next === "dark" ? "dark" : "light";

    stamp(value);

    try {
      if (value === "dark") localStorage.setItem(STORAGE_KEY, "dark");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      memoryFallback = value;
    }

    for (const listener of listeners) listener();
  }

  return (
    <SegmentedControl
      label={t("theme")}
      value={theme}
      onValueChange={apply}
      options={[
        { value: "light", label: t("themeLight") },
        { value: "dark", label: t("themeDark") },
      ]}
    />
  );
}
