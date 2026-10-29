import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "@/lib/orders/fixtures";
import type { DraftCard } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({
  uploadPhoto: vi.fn(),
  removePhoto: vi.fn(),
  compressPhoto: vi.fn(),
}));

// The real actions import server-only modules.
vi.mock("@/app/[locale]/submit/actions", () => ({
  uploadPhoto: mocks.uploadPhoto,
  removePhoto: mocks.removePhoto,
}));
vi.mock("@/lib/photos/compress", () => ({ compressPhoto: mocks.compressPhoto }));

const { CardEditor } = await import("./card-editor");

const c = messages.submit.cards;

const BLANK: DraftCard = {
  id: "11111111-1111-4111-8111-111111111111",
  position: 0,
  identifiedBy: "customer",
  releaseYear: null,
  brand: null,
  language: null,
  name: null,
  setName: null,
  cardNumber: null,
  surface: null,
  signed: false,
  numbered: false,
  declaredValueCents: null,
  service: null,
  tierKey: null,
  addOnKeys: [],
  photo: null,
};

const GRADING = REFERENCE_DRAFT.cards[0];

const onGone = vi.fn();

function Harness({ initial, saved = true }: { initial: DraftCard; saved?: boolean }) {
  const [card, setCard] = useState(initial);
  return (
    <CardEditor
      card={card}
      catalog={CATALOG}
      saved={saved}
      onChange={setCard}
      onRemove={() => {}}
      onGone={onGone}
    />
  );
}

const serviceLabel = (key: keyof typeof messages.catalog.services) =>
  messages.catalog.services[key].label;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardEditor", () => {
  test("no add-on is ticked on a new card", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    await user.click(screen.getByRole("button", { name: serviceLabel("grading") }));
    const box = screen.getByRole("checkbox", {
      name: messages.catalog.addOns.digital_grade.label,
    });
    expect(box).not.toBeChecked();
  });

  test("autograph and dual appear only after Signed is ticked", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    expect(screen.queryByRole("button", { name: serviceLabel("autograph") })).toBeNull();
    expect(screen.queryByRole("button", { name: serviceLabel("dual") })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: c.fields.signed }));
    expect(screen.getByRole("button", { name: serviceLabel("autograph") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: serviceLabel("dual") })).toBeInTheDocument();
  });

  test("unticking Signed on a dual card clears the service and its add-ons", async () => {
    const dual: DraftCard = {
      ...GRADING,
      signed: true,
      service: "dual",
      tierKey: "dual_standard",
      addOnKeys: ["digital_grade"],
    };
    const { user } = renderWithIntl(<Harness initial={dual} />);
    expect(screen.getByRole("button", { name: serviceLabel("dual") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("checkbox", { name: c.fields.signed }));
    expect(screen.queryByRole("button", { name: serviceLabel("dual") })).toBeNull();
    for (const key of ["grading", "authentication"] as const) {
      expect(screen.getByRole("button", { name: serviceLabel(key) })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    // No service, so no extras are offered at all.
    expect(screen.queryByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label })).toBeNull();
    // Choosing grading again must not bring the old extra back.
    await user.click(screen.getByRole("button", { name: serviceLabel("grading") }));
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).not.toBeChecked();
  });

  test("choosing ART identifies it keeps the typed fields, marks them optional and adds the fee", async () => {
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    const name = screen.getByLabelText(c.fields.name);
    expect(name).toHaveValue(GRADING.name);

    const fee = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
      CATALOG.identificationCents / 100,
    );
    await user.click(
      screen.getByRole("button", { name: new RegExp(`^${messages.submit.cards.identification.art.split(" (")[0]}`) }),
    );
    expect(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.name))).toHaveValue(
      GRADING.name,
    );
    expect(screen.getByRole("button", { name: new RegExp(fee.replace("+", "\\+")) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(c.identification.artHint)).toBeInTheDocument();
  });

  test("switching back to entering details makes the empty fields required again", async () => {
    const art = REFERENCE_DRAFT.cards[1];
    const onChange = vi.fn();
    const { user } = renderWithIntl(
      <CardEditor
        card={art}
        catalog={CATALOG}
        saved
        onChange={onChange}
        onRemove={() => {}}
        onGone={onGone}
      />,
    );
    await user.click(screen.getByRole("button", { name: c.identification.customer }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ identifiedBy: "customer" }));
  });

  test("switching service to authentication hides Digital Grade and unticks it", async () => {
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: serviceLabel("authentication") }));
    expect(screen.queryByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label })).toBeNull();
    await user.click(screen.getByRole("button", { name: serviceLabel("grading") }));
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).not.toBeChecked();
  });

  test("tiers whose cap the declared value exceeds are not offered", async () => {
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    const tier = screen.getByLabelText(c.service.tier);
    const options = () => Array.from((tier as HTMLSelectElement).options).map((o) => o.value);
    expect(options()).toContain("grading_express");

    const value = screen.getByLabelText(
      c.fields.value.replace("{currency}", "EUR"),
    );
    await user.clear(value);
    await user.type(value, "2000");
    await user.tab();
    expect(options()).not.toContain("grading_express");
    expect(options()).toContain("grading_standard");
  });

  test("the photo input is disabled until the card's first save lands", () => {
    renderWithIntl(<Harness initial={GRADING} saved={false} />);
    expect(screen.getByLabelText(c.photo.label)).toBeDisabled();
  });
});

describe("CardEditor photo", () => {
  test("is enabled once saved, and uploads the compressed file", async () => {
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    mocks.uploadPhoto.mockResolvedValue({ ok: true, data: { photoId: "p1" } });
    const { user } = renderWithIntl(<Harness initial={GRADING} saved />);
    const input = screen.getByLabelText(c.photo.label);
    expect(input).toBeEnabled();
    await user.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    expect(mocks.uploadPhoto).toHaveBeenCalledTimes(1);
    const fd = mocks.uploadPhoto.mock.calls[0][1] as FormData;
    expect(fd.get("cardId")).toBe(GRADING.id);
    expect(await screen.findByRole("button", { name: c.photo.remove })).toBeInTheDocument();
  });

  test("a card removed elsewhere is reported when the upload says cardGone", async () => {
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    mocks.uploadPhoto.mockResolvedValue({ ok: false, errorKey: "cardGone" });
    const { user } = renderWithIntl(<Harness initial={GRADING} saved />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalled());
  });

  test("an unsupported photo shows the type error", async () => {
    mocks.compressPhoto.mockRejectedValue(new Error("photoUnsupported"));
    const { user } = renderWithIntl(<Harness initial={GRADING} saved />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(messages.submit.errors.photoType)).toBeInTheDocument();
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
  });
});
