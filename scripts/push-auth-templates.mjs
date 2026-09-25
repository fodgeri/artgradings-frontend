// Pushes supabase/templates/* to a HOSTED Supabase project.
//
// config.toml applies the templates to the local stack only; a hosted project
// needs the Management API. Run by hand after a template changes, like
// `npm run db:push`, and for the same reason: CI does not hold a privileged
// Supabase token.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… npm run auth:templates
//
// The project ref comes from SUPABASE_PROJECT_REF, or from the one
// `supabase link` recorded. Subjects and file paths are read from
// supabase/config.toml, which stays their single source.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** config.toml section → Management API field for each setting. */
const FIELDS = {
  "auth.email.template.confirmation": {
    subject: "mailer_subjects_confirmation",
    content_path: "mailer_templates_confirmation_content",
  },
  "auth.email.template.recovery": {
    subject: "mailer_subjects_recovery",
    content_path: "mailer_templates_recovery_content",
  },
  "auth.email.notification.password_changed": {
    enabled: "mailer_notifications_password_changed_enabled",
    subject: "mailer_subjects_password_changed_notification",
    content_path: "mailer_templates_password_changed_notification_content",
  },
};

/**
 * Reads the `[auth.email.template.*]` and `[auth.email.notification.*]`
 * sections. Not a TOML parser: those sections hold only quoted strings and
 * booleans, which JSON.parse reads identically. Commented lines never match.
 *
 * @param {string} toml
 * @returns {Record<string, Record<string, string | boolean>>}
 */
export function readTemplateSections(toml) {
  const sections = {};
  let current = null;

  for (const line of toml.split("\n")) {
    const header = line.match(/^\[(auth\.email\.(?:template|notification)\.[a-z_]+)\]\s*$/);
    if (header) {
      current = header[1];
      sections[current] = {};
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    const pair = current && line.match(/^(\w+)\s*=\s*(.+?)\s*$/);
    if (pair) sections[current][pair[1]] = JSON.parse(pair[2]);
  }

  return sections;
}

/**
 * The PATCH body: subjects and flags as-is, `content_path` replaced by the file.
 *
 * @param {Record<string, Record<string, string | boolean>>} sections
 * @param {(path: string) => string} readFile
 * @returns {Record<string, string | boolean>}
 */
export function buildPayload(sections, readFile) {
  const payload = {};

  for (const [section, fields] of Object.entries(FIELDS)) {
    const values = sections[section];
    if (!values) throw new Error(`supabase/config.toml has no [${section}] section`);

    for (const [key, field] of Object.entries(fields)) {
      if (!(key in values)) throw new Error(`[${section}] has no ${key}`);
      payload[field] = key === "content_path" ? readFile(values[key]) : values[key];
    }
  }

  return payload;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const linked = "supabase/.temp/project-ref";
  const ref =
    process.env.SUPABASE_PROJECT_REF ??
    (existsSync(linked) ? readFileSync(linked, "utf8").trim() : undefined);

  if (!token || !ref) {
    console.error("Set SUPABASE_ACCESS_TOKEN, and SUPABASE_PROJECT_REF unless the project is linked.");
    process.exit(1);
  }

  const payload = buildPayload(
    readTemplateSections(readFileSync("supabase/config.toml", "utf8")),
    (path) => readFileSync(path, "utf8"),
  );

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`Supabase answered ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  console.log(`Pushed ${Object.keys(payload).length} auth email settings to ${ref}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
