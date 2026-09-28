// @vitest-environment node
import { describe, expect, test } from "vitest";

import {
  isRecoverySession,
  RECOVERY_WINDOW_SECONDS,
  resetPasswordDetour,
} from "./recovery-session";

// Claims as GoTrue v2.196 issues them (observed on the local stack): a
// verified recovery link records `otp`, a password sign-in `password`, and a
// refresh keeps the original entry and its timestamp.
const NOW_S = 1_790_625_232;
const NOW_MS = NOW_S * 1000;
const base = { sub: "user-1", email: "user@example.test" };
const recovery = (timestamp = NOW_S) => ({ ...base, amr: [{ method: "otp", timestamp }] });
const password = { ...base, amr: [{ method: "password", timestamp: NOW_S }] };

describe("isRecoverySession", () => {
  test("a session minted by an emailed link moments ago is one", () => {
    expect(isRecoverySession(recovery(), NOW_MS)).toBe(true);
  });

  test("stays one until the window closes, and not a second longer", () => {
    expect(isRecoverySession(recovery(NOW_S - RECOVERY_WINDOW_SECONDS), NOW_MS)).toBe(true);
    expect(isRecoverySession(recovery(NOW_S - RECOVERY_WINDOW_SECONDS - 1), NOW_MS)).toBe(false);
  });

  test("the window is the hour a recovery link itself is valid for", () => {
    expect(RECOVERY_WINDOW_SECONDS).toBe(60 * 60);
  });

  test("a password session is not one", () => {
    expect(isRecoverySession(password, NOW_MS)).toBe(false);
  });

  test("an otp entry alongside another method still counts", () => {
    const both = { ...base, amr: [...password.amr, { method: "otp", timestamp: NOW_S }] };
    expect(isRecoverySession(both, NOW_MS)).toBe(true);
  });

  test.each([
    ["no claims", undefined],
    ["no amr", base],
    ["an empty amr", { ...base, amr: [] }],
    // RFC 8176 strings carry no timestamp, so freshness cannot be shown.
    ["a string-form amr", { ...base, amr: ["otp"] }],
    ["an entry without a timestamp", { ...base, amr: [{ method: "otp" }] }],
  ])("%s is not one", (_label, claims) => {
    expect(isRecoverySession(claims as never, NOW_MS)).toBe(false);
  });
});

describe("resetPasswordDetour", () => {
  test("no session: ask for a link", () => {
    expect(resetPasswordDetour(undefined, NOW_MS)).toBe("/forgot-password");
  });

  test("an ordinary session: change the password in settings, with the current one", () => {
    expect(resetPasswordDetour(password, NOW_MS)).toBe("/account/settings");
  });

  test("a stale recovery session is an ordinary one", () => {
    const stale = recovery(NOW_S - RECOVERY_WINDOW_SECONDS - 1);
    expect(resetPasswordDetour(stale, NOW_MS)).toBe("/account/settings");
  });

  test("a fresh recovery session gets the form", () => {
    expect(resetPasswordDetour(recovery(), NOW_MS)).toBeNull();
  });
});
