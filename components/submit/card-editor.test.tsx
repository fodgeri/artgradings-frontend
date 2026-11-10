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
  ensureSaved: vi.fn(),
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

function Harness({ initial, showAllProblems }: { initial: DraftCard; showAllProblems?: boolean }) {
  const [card, setCard] = useState(initial);
  return (
    <CardEditor
      card={card}
      catalog={CATALOG}
      ensureSaved={mocks.ensureSaved}
      showAllProblems={showAllProblems}
      onChange={setCard}
      onPhoto={(photo) => setCard((prev) => ({ ...prev, photo }))}
      onGone={onGone}
    />
  );
}

const euros = (cents: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(cents / 100);

const serviceLabel = (key: keyof typeof messages.catalog.services) =>
  messages.catalog.services[key].label;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureSaved.mockResolvedValue(true);
});

describe("CardEditor", () => {
  test("no add-on is ticked on a new card", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    await user.click(screen.getByRole("radio", { name: serviceLabel("grading") }));
    const box = screen.getByRole("checkbox", {
      name: messages.catalog.addOns.digital_grade.label,
    });
    expect(box).not.toBeChecked();
  });

  test("autograph and dual appear only after Signed is ticked", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    expect(screen.queryByRole("radio", { name: serviceLabel("autograph") })).toBeNull();
    expect(screen.queryByRole("radio", { name: serviceLabel("dual") })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: c.fields.signed }));
    expect(screen.getByRole("radio", { name: serviceLabel("autograph") })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: serviceLabel("dual") })).toBeInTheDocument();
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
    expect(screen.getByRole("radio", { name: serviceLabel("dual") })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: c.fields.signed }));
    expect(screen.queryByRole("radio", { name: serviceLabel("dual") })).toBeNull();
    for (const key of ["grading", "authentication"] as const) {
      expect(screen.getByRole("radio", { name: serviceLabel(key) })).not.toBeChecked();
    }
    // No service, so no extras are offered at all.
    expect(screen.queryByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label })).toBeNull();
    // Choosing grading again must not bring the old extra back.
    await user.click(screen.getByRole("radio", { name: serviceLabel("grading") }));
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).not.toBeChecked();
  });

  test("choosing ART identifies it keeps the typed fields, marks them optional and adds the fee", async () => {
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    const name = screen.getByLabelText(c.fields.name);
    expect(name).toHaveValue(GRADING.name);

    const art = screen.getByRole("radio", { name: c.identification.art });
    await user.click(art);
    expect(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.name))).toHaveValue(
      GRADING.name,
    );
    expect(art).toBeChecked();
    expect(art).toHaveAccessibleDescription(
      expect.stringContaining(c.identification.fee.replace("{fee}", euros(CATALOG.identificationCents))),
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
        ensureSaved={mocks.ensureSaved}
        onChange={onChange}
        onPhoto={() => {}}
        onGone={onGone}
      />,
    );
    await user.click(screen.getByRole("radio", { name: c.identification.customer }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ identifiedBy: "customer" }));
  });

  test("switching service to authentication hides Digital Grade and unticks it", async () => {
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).toBeChecked();
    await user.click(screen.getByRole("radio", { name: serviceLabel("authentication") }));
    expect(screen.queryByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label })).toBeNull();
    await user.click(screen.getByRole("radio", { name: serviceLabel("grading") }));
    expect(
      screen.getByRole("checkbox", { name: messages.catalog.addOns.digital_grade.label }),
    ).not.toBeChecked();
  });

  const tierLabel = (key: keyof typeof messages.catalog.tiers) => messages.catalog.tiers[key].label;
  const valueField = () => screen.getByLabelText(c.fields.value.replace("{currency}", "EUR"));

  test("a tier the declared value rules out stays visible, disabled, and says why", async () => {
    const standard: DraftCard = { ...GRADING, tierKey: "grading_standard" };
    const { user } = renderWithIntl(<Harness initial={standard} />);
    const express = () => screen.getByRole("radio", { name: tierLabel("grading_express") });
    expect(express()).not.toHaveAttribute("aria-disabled", "true");

    await user.clear(valueField());
    await user.type(valueField(), "2000");
    await user.tab();

    expect(express()).toHaveAttribute("aria-disabled", "true");
    const reason = c.service.overLimit
      .replace("{limit}", euros(100000))
      .replace("{value}", euros(200000));
    expect(express()).toHaveAccessibleDescription(expect.stringContaining(reason));
    expect(screen.getByRole("radio", { name: tierLabel("grading_standard") })).toBeChecked();
  });

  test("a chosen tier the value then outgrows stays chosen and is flagged at once", async () => {
    const express: DraftCard = { ...GRADING, tierKey: "grading_express", declaredValueCents: 5000 };
    const { user } = renderWithIntl(<Harness initial={express} />);
    expect(screen.queryByText(c.problems.overCap)).toBeNull();

    await user.clear(valueField());
    await user.type(valueField(), "2000");
    await user.tab();

    expect(screen.getByRole("radio", { name: tierLabel("grading_express") })).toBeChecked();
    expect(screen.getByText(c.problems.overCap)).toBeInTheDocument();
  });

  test("a service card shows the lowest price of its tiers", () => {
    renderWithIntl(<Harness initial={BLANK} />);
    const grading = screen.getByRole("radio", { name: serviceLabel("grading") });
    expect(grading.textContent).toContain(c.service.from);
    expect(grading.textContent).toContain(euros(100));
  });

  test("an unsigned card says that signed cards have further services", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    expect(screen.getByText(c.service.signedMore)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: c.fields.signed }));
    expect(screen.queryByText(c.service.signedMore)).toBeNull();
  });

  test("a service the catalog adds without an icon or copy still renders", () => {
    const catalog = {
      ...CATALOG,
      services: [...CATALOG.services, { key: "brand_new", position: 9, requiresSigned: false }],
    };
    renderWithIntl(
      <CardEditor
        card={BLANK}
        catalog={catalog}
        ensureSaved={mocks.ensureSaved}
        onChange={() => {}}
        onPhoto={() => {}}
        onGone={onGone}
      />,
    );
    expect(screen.getByRole("radio", { name: "brand_new" })).toBeInTheDocument();
  });

  test("showAllProblems reveals errors on fields nobody touched", () => {
    renderWithIntl(<Harness initial={BLANK} showAllProblems />);
    expect(screen.getByLabelText(c.fields.name)).toHaveAccessibleDescription(c.problems.nameMissing);
    expect(screen.getByText(c.problems.serviceMissing)).toBeInTheDocument();
  });
});

describe("CardEditor photo", () => {
  test("a photo on a never-saved card saves the card first, then uploads", async () => {
    const order: string[] = [];
    mocks.ensureSaved.mockImplementation(async () => (order.push("save"), true));
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    mocks.uploadPhoto.mockImplementation(async () => (order.push("upload"), { ok: true, data: { photoId: "p1" } }));
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    const input = screen.getByLabelText(c.photo.label);
    expect(input).toBeEnabled();
    await user.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("button", { name: c.photo.remove })).toBeInTheDocument();
    expect(order).toEqual(["save", "upload"]);
  });

  test("nothing is uploaded when that first save fails", async () => {
    mocks.ensureSaved.mockResolvedValue(false);
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(messages.submit.errors.generic)).toBeInTheDocument();
    expect(mocks.compressPhoto).not.toHaveBeenCalled();
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
  });

  test("shows that it is uploading while the upload is in flight", async () => {
    let finish!: (v: unknown) => void;
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"]));
    mocks.uploadPhoto.mockReturnValue(new Promise((r) => (finish = r)));
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(c.photo.uploading)).toBeInTheDocument();
    finish({ ok: true, data: { photoId: "p1" } });
    expect(await screen.findByRole("button", { name: c.photo.remove })).toBeInTheDocument();
  });

  test("uploads the compressed file for the card", async () => {
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    mocks.uploadPhoto.mockResolvedValue({ ok: true, data: { photoId: "p1" } });
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
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
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalled());
  });

  test("an unsupported photo shows the type error", async () => {
    mocks.compressPhoto.mockRejectedValue(new Error("photoUnsupported"));
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(messages.submit.errors.photoType)).toBeInTheDocument();
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
  });
});

describe("CardEditor review fixes", () => {
  test("an edit made during an upload survives the upload finishing", async () => {
    let finish!: (v: unknown) => void;
    mocks.compressPhoto.mockResolvedValue(new Blob(["x"]));
    mocks.uploadPhoto.mockReturnValue(new Promise((r) => (finish = r)));
    const { user } = renderWithIntl(<Harness initial={GRADING} />);
    await user.upload(screen.getByLabelText(c.photo.label), new File(["x"], "a.png", { type: "image/png" }));
    const name = screen.getByLabelText(c.fields.name);
    await user.type(name, "X");
    finish({ ok: true, data: { photoId: "p9" } });
    expect(await screen.findByRole("button", { name: c.photo.remove })).toBeInTheDocument();
    expect(screen.getByLabelText(c.fields.name)).toHaveValue(`${GRADING.name}X`);
  });

  test("a field error is part of the input's accessible description after blur", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    const name = screen.getByLabelText(c.fields.name);
    await user.click(name);
    await user.tab();
    expect(name).toHaveAccessibleDescription(c.problems.nameMissing);
  });

  test("customer to ART to customer keeps every typed field", async () => {
    const { user } = renderWithIntl(<Harness initial={BLANK} />);
    await user.type(screen.getByLabelText(c.fields.name), "Pikachu");
    await user.type(screen.getByLabelText(c.fields.setName), "Jungle");
    await user.type(screen.getByLabelText(c.fields.year), "1999");
    await user.click(screen.getByRole("radio", { name: c.identification.art }));
    const opt = (n: string) => c.fields.optional.replace("{label}", n);
    expect(screen.getByLabelText(opt(c.fields.name))).toHaveValue("Pikachu");
    expect(screen.getByLabelText(opt(c.fields.setName))).toHaveValue("Jungle");
    expect(screen.getByLabelText(opt(c.fields.year))).toHaveValue("1999");
    await user.click(screen.getByRole("radio", { name: c.identification.customer }));
    expect(screen.getByLabelText(c.fields.name)).toHaveValue("Pikachu");
    expect(screen.getByLabelText(c.fields.setName)).toHaveValue("Jungle");
    expect(screen.getByLabelText(c.fields.year)).toHaveValue("1999");
  });
});
