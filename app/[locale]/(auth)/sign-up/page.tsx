import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

import { signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default function SignUpPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("signUp.title")} lead={t("signUp.lead")} />
      <AuthForm action={signUp} submitLabel={t("signUp.submit")}>
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label={t("fields.password")}>
          <FieldInput
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <FieldDescription>
            {t("fields.passwordHint", { min: PASSWORD_MIN_LENGTH })}
          </FieldDescription>
        </Field>
      </AuthForm>
      <p className="mt-6 text-sm text-muted">
        {t.rich("signUp.haveAccount", {
          link: (chunks) => (
            <Link href="/sign-in" className="focus-ring font-semibold text-gold-ink hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
