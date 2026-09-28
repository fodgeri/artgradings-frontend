import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { NAME_MAX_LENGTH } from "@/lib/auth/profile-name";

import { changeEmail, changePassword, deleteAccount, updateName } from "./actions";

function SettingsCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-serif text-h3 text-ink">{title}</h2>
      {lead && <p className="mt-2 text-muted">{lead}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  );
}

/**
 * The four settings forms. Separate from the page because the page is an
 * async Server Component, which Vitest cannot render; this one is not.
 *
 * Each card is its own form and action, so one failing does not reset the
 * others. Turnstile appears only where the action signs in to re-verify the
 * password, because sign-in is what requires it.
 */
export function SettingsCards({
  firstName,
  lastName,
  email,
}: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const t = useTranslations("auth");

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title={t("settings.name.title")} lead={t("settings.name.lead")}>
        <AuthForm
          action={updateName}
          submitLabel={t("settings.name.submit")}
          sentMessage={t("settings.name.saved")}
          captcha={false}
        >
          <Field label={t("settings.name.firstName")}>
            <FieldInput
              name="firstName"
              autoComplete="given-name"
              maxLength={NAME_MAX_LENGTH}
              defaultValue={firstName ?? ""}
            />
          </Field>
          <Field label={t("settings.name.lastName")}>
            <FieldInput
              name="lastName"
              autoComplete="family-name"
              maxLength={NAME_MAX_LENGTH}
              defaultValue={lastName ?? ""}
            />
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.email.title")} lead={t("settings.email.current", { email })}>
        {/* No password and no captcha: the link sent to the OLD inbox is the proof. */}
        <AuthForm
          action={changeEmail}
          submitLabel={t("settings.email.submit")}
          sentMessage={t("settings.email.sent")}
          resetOnSent
          captcha={false}
        >
          <Field label={t("settings.email.newEmail")}>
            <FieldInput type="email" name="email" autoComplete="email" required />
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.password.title")} lead={t("settings.password.lead")}>
        <AuthForm
          action={changePassword}
          submitLabel={t("settings.password.submit")}
          sentMessage={t("settings.password.changed")}
          resetOnSent
        >
          <Field label={t("settings.password.currentPassword")}>
            <FieldInput
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={t("fields.newPassword")}>
            <FieldInput
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
            <FieldDescription>{t("fields.passwordHint", { min: PASSWORD_MIN_LENGTH })}</FieldDescription>
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.delete.title")} lead={t("settings.delete.lead")}>
        {/* Ghost, not red: the design system has no danger colour yet. */}
        <AuthForm
          action={deleteAccount}
          submitLabel={t("settings.delete.submit")}
          submitVariant="ghost"
        >
          <Field label={t("settings.password.currentPassword")}>
            <FieldInput
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
        </AuthForm>
      </SettingsCard>
    </div>
  );
}
