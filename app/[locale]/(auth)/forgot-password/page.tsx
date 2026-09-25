import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";

import { requestPasswordReset } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgotPassword");
  return { title: t("title") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("forgotPassword.title")} lead={t("forgotPassword.lead")} />
      <AuthForm
        action={requestPasswordReset}
        submitLabel={t("forgotPassword.submit")}
        sentMessage={t("forgotPassword.sent")}
      >
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
      </AuthForm>
      <p className="mt-6 text-sm text-muted">
        {t.rich("forgotPassword.backToSignIn", {
          link: (chunks) => (
            <Link href="/sign-in" className="focus-ring text-gold-ink hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
