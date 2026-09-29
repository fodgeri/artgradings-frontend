import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { resetPasswordDetour } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";

import { resetPassword } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.resetPassword");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;

  // Only a fresh recovery session gets the form. Without a session, ask for a
  // link; any other session changes its password in settings, with the
  // current one. The action applies the same gate.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const detour = resetPasswordDetour(data?.claims);
  if (detour) return redirect({ href: detour, locale: resolveLocale(locale) });

  const t = await getTranslations("auth");

  return (
    <>
      <AuthHeading title={t("resetPassword.title")} lead={t("resetPassword.lead")} />
      {/* No captcha: only a session minted by an emailed link reaches this form. */}
      <AuthForm action={resetPassword} submitLabel={t("resetPassword.submit")} captcha={false}>
        <Field label={t("fields.newPassword")}>
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
    </>
  );
}
