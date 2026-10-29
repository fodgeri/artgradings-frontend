"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useTranslations("orders.printables");
  return (
    <Button type="button" variant="gold" className="print:hidden" onClick={() => window.print()}>
      {t("print")}
    </Button>
  );
}
