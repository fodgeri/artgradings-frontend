import { waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Field, FieldInput } from "@/components/ui/field";
import type { AuthAction, AuthFormState } from "@/lib/auth/action-state";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { AuthForm } from "./auth-form";

const action = vi.fn<AuthAction>();

beforeEach(() => {
  action.mockReset();
});

afterEach(() => {
  delete window.turnstile;
});

function renderForm(
  props: {
    captcha?: boolean;
    sentMessage?: string;
    resetOnSent?: boolean;
    doneOnSent?: boolean;
    submitVariant?: "gold" | "ink" | "ghost";
  } = {},
) {
  return renderWithIntl(
    <AuthForm
      action={action}
      submitLabel={messages.auth.signIn.submit}
      captcha={props.captcha ?? false}
      sentMessage={props.sentMessage}
      resetOnSent={props.resetOnSent}
      doneOnSent={props.doneOnSent}
      submitVariant={props.submitVariant}
    >
      <Field label={messages.auth.fields.email}>
        <FieldInput type="email" name="email" required />
      </Field>
    </AuthForm>,
  );
}

async function submit(user: ReturnType<typeof renderForm>["user"], email = "user@example.test") {
  await user.type(screen.getByLabelText(messages.auth.fields.email), email);
  await user.click(screen.getByRole("button", { name: messages.auth.signIn.submit }));
}

describe("AuthForm", () => {
  test("calls the action with the locale and the form's data", async () => {
    action.mockResolvedValue({ status: "idle" });
    const { user } = renderForm();
    await submit(user);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [locale, , data] = action.mock.calls[0];
    expect(locale).toBe("en");
    expect(data.get("email")).toBe("user@example.test");
  });

  test("shows the error the action returns", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.auth.errors.invalidCredentials,
    );
  });

  test("interpolates the password limits into an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "passwordTooShort" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("10");
  });

  test("links the unconfirmed-email error to the resend page", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "emailNotConfirmed" });
    const { user } = renderForm();
    await submit(user);

    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("a")).toHaveAttribute("href", "/sign-up/check-email");
  });

  test("keeps what the user typed after an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm();
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("shows the sent message", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent });
    await submit(user);

    expect(await screen.findByRole("status")).toHaveTextContent(
      messages.auth.forgotPassword.sent,
    );
  });

  test("disables the submit button while the action is pending", async () => {
    let finish: (state: AuthFormState) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderForm();
    await submit(user);

    const button = screen.getByRole("button", { name: messages.auth.signIn.submit });
    await waitFor(() => expect(button).toBeDisabled());
    await act(async () => finish({ status: "idle" }));
    expect(button).toBeEnabled();
  });

  test("submits the Turnstile token with the form", async () => {
    const render = vi.fn<(container: HTMLElement, options: Record<string, unknown>) => string>(
      () => "w1",
    );
    window.turnstile = { render, reset: vi.fn(), remove: vi.fn() };
    action.mockResolvedValue({ status: "idle" });

    const { user } = renderForm({ captcha: true });
    await waitFor(() => expect(render).toHaveBeenCalled());
    const options = render.mock.calls[0][1] as { callback: (token: string) => void };
    act(() => options.callback("token-abc"));
    await submit(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][2].get("captchaToken")).toBe("token-abc");
  });

  test("interpolates the name limit into an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "nameTooLong" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("100");
  });

  test("keeps the fields after success by default", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent });
    await submit(user);

    await screen.findByRole("status");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("clears the fields after success with resetOnSent", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent, resetOnSent: true });
    await submit(user);

    await screen.findByRole("status");
    await waitFor(() =>
      expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue(""),
    );
  });

  test("keeps the fields after an error even with resetOnSent", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm({ resetOnSent: true });
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("hides the submit button once sent with doneOnSent", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent, doneOnSent: true });
    await submit(user);

    await screen.findByRole("status");
    expect(
      screen.queryByRole("button", { name: messages.auth.signIn.submit }),
    ).not.toBeInTheDocument();
  });

  test("keeps the submit button after an error with doneOnSent", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "generic" });
    const { user } = renderForm({ doneOnSent: true });
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: messages.auth.signIn.submit })).toBeInTheDocument();
  });

  test("styles the submit button with submitVariant", () => {
    renderForm({ submitVariant: "ghost" });
    // `ghost` is the only variant built on the `glass` utility.
    expect(screen.getByRole("button", { name: messages.auth.signIn.submit }).className).toContain(
      "glass",
    );
  });
});
