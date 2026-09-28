import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { safeNext } from "@/lib/auth/safe-next";

import { signIn } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("title") };
}

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  const { error, next } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <>
      <AuthHeading title={t("signIn.title")} lead={t("signIn.lead")} />

      {error === "link_expired" && (
        <p
          role="status"
          className="mb-6 rounded-control border border-gold-line bg-gold-soft px-3.5 py-3 text-sm text-ink"
        >
          {t("signIn.linkExpired")}
        </p>
      )}

      <AuthForm action={signIn} submitLabel={t("signIn.submit")}>
        {/* Sanitised here for rendering and again in the action, which is
            the check that counts: this field is editable in the browser. */}
        <input type="hidden" name="next" value={safeNext(next)} />
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label={t("fields.password")}>
          <FieldInput type="password" name="password" autoComplete="current-password" required />
        </Field>
      </AuthForm>

      <div className="mt-6 flex flex-col gap-2 text-sm text-muted">
        <Link href="/forgot-password" className="focus-ring self-start text-gold-ink hover:underline">
          {t("signIn.forgotPassword")}
        </Link>
        <p>
          {t.rich("signIn.noAccount", {
            link: (chunks) => (
              <Link href="/sign-up" className="focus-ring font-semibold text-gold-ink hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </>
  );
}
