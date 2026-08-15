"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

type Choice = "light" | "dark" | "system";

function readStored(): Choice {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
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
  const [choice, setChoice] = useState<Choice>("system");

  // Read after mount, not during render: the server has no localStorage, and
  // reading it during render would produce a hydration mismatch.
  useEffect(() => {
    setChoice(readStored());
  }, []);

  function apply(next: string) {
    const value = next as Choice;
    setChoice(value);

    try {
      if (value === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", value);
        document.documentElement.dataset.theme = value;
      }
    } catch {
      // Private-mode Safari throws on localStorage. The in-page choice still
      // applies; it just will not survive a reload.
    }
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
