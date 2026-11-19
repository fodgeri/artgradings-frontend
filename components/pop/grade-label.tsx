import { useFormatter, useTranslations } from "next-intl";

import type { Grade } from "@/lib/pop/types";

/** A grade as people say it: the numeral, then its name ("10 Gem Mint"). */
export function GradeLabel({ grade }: { grade: Grade }) {
  const t = useTranslations("catalog.grades");
  const format = useFormatter();

  return (
    <span>
      <span className="font-serif">{format.number(grade.value)}</span>{" "}
      <span>{t(`${grade.key}.label`)}</span>
    </span>
  );
}
