import { useTranslations } from "next-intl";
import { useId } from "react";

import { Link } from "@/i18n/navigation";
import type { CategoryKind } from "@/lib/pop/keys";
import type { PopSetSummary } from "@/lib/pop/types";

type Group = { key: string; title: string | null; sets: PopSetSummary[] };

function groupSets(kind: CategoryKind, sets: PopSetSummary[]): Group[] {
  const bySeries = kind === "tcg";
  const map = new Map<string, PopSetSummary[]>();
  for (const s of sets) {
    const key = bySeries ? (s.series ?? "") : s.releaseYear === null ? "" : String(s.releaseYear);
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  const earliest = (list: PopSetSummary[]) =>
    Math.min(...list.map((s) => s.releaseYear ?? Infinity));
  return [...map.entries()]
    .sort(([ka, a], [kb, b]) => {
      if (ka === "" || kb === "") return ka === "" ? 1 : -1;
      // Eras run oldest first, years newest first.
      return bySeries ? earliest(a) - earliest(b) || ka.localeCompare(kb) : Number(kb) - Number(ka);
    })
    .map(([key, list]) => ({
      key,
      title: key === "" ? null : key,
      sets: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function CategorySets({ kind, sets }: { kind: CategoryKind; sets: PopSetSummary[] }) {
  const t = useTranslations("pop.category");
  const prefix = useId();

  return (
    <div className="flex flex-col gap-10">
      {groupSets(kind, sets).map((group, i) => (
        <section key={group.key} aria-labelledby={`${prefix}-${i}`}>
          <h2 id={`${prefix}-${i}`} className="font-serif text-h3 text-ink">
            {group.title ?? (kind === "tcg" ? t("noSeries") : t("noYear"))}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.sets.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/pop-report/sets/${s.id}`}
                  className="focus-ring flex h-full flex-col gap-1 rounded-card border border-hairline bg-surface-raised p-4 transition-colors hover:border-gold-line"
                >
                  <span className="text-ink">
                    {s.name}
                    {s.language && s.language !== "en" && (
                      <span className="ml-2 font-mono text-label uppercase text-muted">{t("language", { language: s.language })}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted">
                    {t("setMeta", { cards: s.cardCount, total: s.total })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
