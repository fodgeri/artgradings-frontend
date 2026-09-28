import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.accountDeleted");
  return { title: t("title") };
}

/**
 * Where deletion lands. Its own static page: a notice on the home page would
 * need to read the request and make it dynamic.
 */
export default function AccountDeletedPage() {
  const t = useTranslations("auth.accountDeleted");

  return (
    <>
      <AuthHeading title={t("title")} lead={t("lead")} />
      <Link href="/" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
        {t("home")}
      </Link>
    </>
  );
}
