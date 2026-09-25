import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";

import { resendConfirmation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.checkEmail");
  return { title: t("title") };
}

export default function CheckEmailPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("checkEmail.title")} lead={t("checkEmail.lead")} />
      <p className="mb-6 text-sm text-muted">{t("checkEmail.resendLead")}</p>
      <AuthForm
        action={resendConfirmation}
        submitLabel={t("checkEmail.submit")}
        sentMessage={t("checkEmail.sent")}
      >
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
      </AuthForm>
    </>
  );
}
