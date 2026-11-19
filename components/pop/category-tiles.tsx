import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { CategoryKind } from "@/lib/pop/keys";
import type { PopCategory } from "@/lib/pop/types";

const KINDS: CategoryKind[] = ["tcg", "sports"];

export function CategoryTiles({ categories }: { categories: PopCategory[] }) {
  const t = useTranslations("pop.category");
  const kinds = useTranslations("catalog.kinds");
  const names = useTranslations("catalog.categories");

  return (
    <div className="flex flex-col gap-10">
      {KINDS.map((kind) => {
        const items = categories.filter((c) => c.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`kind-${kind}`}>
            <h2 id={`kind-${kind}`} className="font-serif text-h3 text-ink">
              {kinds(`${kind}.label`)}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <li key={c.key}>
                  <Link
                    href={`/pop-report/${c.key}`}
                    className="focus-ring flex h-full flex-col gap-1 rounded-card border border-hairline bg-surface-raised p-5 transition-colors hover:border-gold-line"
                  >
                    <span className="font-serif text-h3 text-ink">{names(`${c.key}.label`)}</span>
                    <span className="text-sm text-muted">
                      {t("tileMeta", { sets: c.setCount, total: c.total })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
