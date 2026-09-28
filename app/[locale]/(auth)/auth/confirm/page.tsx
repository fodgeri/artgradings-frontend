import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";

import { confirmToken } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.confirm");
  return { title: t("emailTitle") };
}

export default async function ConfirmPage({ searchParams }: PageProps<"/[locale]/auth/confirm">) {
  const { token_hash: tokenHash, type } = await searchParams;
  const t = await getTranslations("auth.confirm");

  return (
    <>
      <AuthHeading
        title={type === "recovery" ? t("recoveryTitle") : t("emailTitle")}
        lead={t("lead")}
      />
      {/* No captcha: the token is the proof, and it is single-use. */}
      <AuthForm action={confirmToken} submitLabel={t("submit")} captcha={false}>
        <input type="hidden" name="token_hash" value={typeof tokenHash === "string" ? tokenHash : ""} />
        <input type="hidden" name="type" value={typeof type === "string" ? type : ""} />
      </AuthForm>
    </>
  );
}
