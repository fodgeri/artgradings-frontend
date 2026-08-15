import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Field, FieldInput, FieldSelect } from "./field";

describe("Field", () => {
  test("associates the label with the input", () => {
    renderWithIntl(
      <Field label="Card name">
        <FieldInput placeholder="e.g. Charizard" />
      </Field>,
    );
    // getByLabelText only resolves when the association is real.
    expect(screen.getByLabelText("Card name")).toBeInTheDocument();
  });

  test("typing updates the input", async () => {
    const { user } = renderWithIntl(
      <Field label="Card name">
        <FieldInput />
      </Field>,
    );
    const input = screen.getByLabelText("Card name");
    await user.type(input, "Blastoise");
    expect(input).toHaveValue("Blastoise");
  });

  test("associates the label with a select", () => {
    renderWithIntl(
      <Field label="Service level">
        <FieldSelect>
          <option value="std">Standard</option>
          <option value="exp">Express</option>
        </FieldSelect>
      </Field>,
    );
    expect(screen.getByLabelText("Service level").tagName).toBe("SELECT");
  });

  test("selecting an option updates the value", async () => {
    const { user } = renderWithIntl(
      <Field label="Service level">
        <FieldSelect defaultValue="std">
          <option value="std">Standard</option>
          <option value="exp">Express</option>
        </FieldSelect>
      </Field>,
    );
    const select = screen.getByLabelText("Service level");
    await user.selectOptions(select, "exp");
    expect(select).toHaveValue("exp");
  });
});
