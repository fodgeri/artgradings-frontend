// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { buildPayload, readTemplateSections } from "./push-auth-templates.mjs";

const toml = readFileSync("supabase/config.toml", "utf8");
const readFile = (path: string) => readFileSync(path, "utf8");

describe("readTemplateSections", () => {
  test("reads subject, path and enabled from the template sections only", () => {
    const sections = readTemplateSections(toml);
    expect(Object.keys(sections).sort()).toEqual([
      "auth.email.notification.email_changed",
      "auth.email.notification.password_changed",
      "auth.email.template.confirmation",
      "auth.email.template.email_change",
      "auth.email.template.recovery",
    ]);
    expect(sections["auth.email.notification.password_changed"].enabled).toBe(true);
  });

  test("ignores commented-out sections", () => {
    expect(readTemplateSections('# [auth.email.template.invite]\n# subject = "x"\n')).toEqual({});
  });
});

describe("buildPayload", () => {
  const payload = buildPayload(readTemplateSections(toml), readFile);

  test("sets every Management API field", () => {
    expect(Object.keys(payload).sort()).toEqual([
      "mailer_notifications_email_changed_enabled",
      "mailer_notifications_password_changed_enabled",
      "mailer_subjects_confirmation",
      "mailer_subjects_email_change",
      "mailer_subjects_email_changed_notification",
      "mailer_subjects_password_changed_notification",
      "mailer_subjects_recovery",
      "mailer_templates_confirmation_content",
      "mailer_templates_email_change_content",
      "mailer_templates_email_changed_notification_content",
      "mailer_templates_password_changed_notification_content",
      "mailer_templates_recovery_content",
    ]);
  });

  test("links confirmation and recovery through /auth/confirm with the right type", () => {
    expect(payload.mailer_templates_confirmation_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=email",
    );
    expect(payload.mailer_templates_recovery_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=recovery",
    );
    expect(payload.mailer_templates_email_change_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=email_change",
    );
  });

  test("fails when a section is missing", () => {
    expect(() => buildPayload({}, readFile)).toThrow("auth.email.template.confirmation");
  });
});
