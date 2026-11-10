"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { removeCard, saveCard } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { MAX_CARDS_PER_ORDER, cardProblems } from "@/lib/orders/card-rules";
import type { OrderErrorKey } from "@/lib/orders/errors";
import { quoteDraft } from "@/lib/orders/pricing";
import type { Catalog, Draft, DraftCard, DraftShipping } from "@/lib/orders/types";
import { randomId } from "@/lib/uuid";

import { CARD_FIELD_OF, type CardFieldName, CardEditor, orderedCardProblems } from "./card-editor";
import { type OrderTodo, RunningTotal } from "./running-total";
import { useAutosave } from "./use-autosave";

const NO_SHIPPING: DraftShipping = {
  method: null,
  firstName: null,
  lastName: null,
  phone: null,
  country: null,
  postcode: null,
  city: null,
  addressLine: null,
  inboundInsuranceConfirmed: false,
};

function blankCard(position: number): DraftCard {
  return {
    id: randomId(),
    position,
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
}

/** Whether removing the card would lose anything the customer entered. */
function hasContent(card: DraftCard): boolean {
  return (
    card.identifiedBy !== "customer" ||
    card.releaseYear !== null ||
    [card.brand, card.language, card.name, card.setName, card.cardNumber, card.surface].some(
      (v) => v !== null && v.trim() !== "",
    ) ||
    card.signed ||
    card.numbered ||
    card.declaredValueCents !== null ||
    card.service !== null ||
    card.photo !== null
  );
}

type Flusher = () => Promise<boolean>;

/**
 * Step 1: the card list. Each card autosaves on its own; Next waits for all
 * of them. Next is never disabled for missing details: it shows what is
 * missing and takes the customer there.
 */
export function CardsStep({
  initialDraft,
  catalog,
}: {
  initialDraft: Draft | null;
  catalog: Catalog;
}) {
  const t = useTranslations("submit");
  const tCatalog = useTranslations("catalog");
  const router = useRouter();
  const locale = useLocale();

  const [cards, setCards] = useState<DraftCard[]>(() =>
    initialDraft && initialDraft.cards.length > 0 ? initialDraft.cards : [blankCard(0)],
  );
  const [persisted, setPersisted] = useState<ReadonlySet<string>>(
    () => new Set(initialDraft?.cards.map((c) => c.id) ?? []),
  );
  const [openId, setOpenId] = useState<string>(() => cards[0].id);
  const [notice, setNotice] = useState<OrderErrorKey | "nextFailed" | null>(null);
  const [leaving, setLeaving] = useState(false);
  // The card whose every problem is shown, touched or not.
  const [revealId, setRevealId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ cardId: string; field: CardFieldName; tick: number } | null>(null);
  const flushers = useRef(new Map<string, Flusher>());
  // Mirrors `persisted` for async code that must not read a stale render.
  const persistedIds = useRef(new Set(initialDraft?.cards.map((c) => c.id) ?? []));
  const removing = useRef(new Set<string>());

  const quote = useMemo(
    () =>
      quoteDraft(
        {
          reference: initialDraft?.reference ?? "",
          currency: catalog.currency,
          cards,
          shipping: initialDraft?.shipping ?? NO_SHIPPING,
        },
        catalog,
      ),
    [cards, catalog, initialDraft],
  );

  const catalogLabel = (key: string) => (tCatalog.has(key as never) ? tCatalog(key as never) : null);
  const titleOf = (card: DraftCard) =>
    card.name?.trim() || (card.identifiedBy === "art" ? t("cards.unknownSummary") : t("cards.untitled"));
  const serviceLine = (card: DraftCard) => {
    const parts = [
      card.service ? (catalogLabel(`services.${card.service}.label`) ?? card.service) : null,
      card.tierKey ? (catalogLabel(`tiers.${card.tierKey}.label`) ?? card.tierKey) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  // Opens the card, shows all of its problems and moves focus to the field.
  const goTo = (cardId: string, field: CardFieldName) => {
    setOpenId(cardId);
    setRevealId(cardId);
    setFocusTarget((prev) => ({ cardId, field, tick: (prev?.tick ?? 0) + 1 }));
  };

  // After the render that opened the card: the field exists only then.
  useEffect(() => {
    if (!focusTarget) return;
    const slot = document.querySelector(`[data-card="${focusTarget.cardId}"]`);
    const target = slot?.querySelector<HTMLElement>(`[data-field="${focusTarget.field}"]`);
    if (!target) return;
    const control = target.matches("input, select")
      ? target
      : (target.querySelector<HTMLElement>('[role="radio"]:not([aria-disabled="true"])') ?? target);
    control.scrollIntoView?.({ block: "center" });
    control.focus?.();
  }, [focusTarget]);

  const todos: OrderTodo[] = cards.flatMap((card, index) =>
    orderedCardProblems(cardProblems(card, catalog)).map((problem) => ({
      id: `${card.id}-${problem}`,
      label: t("cards.todo", { number: index + 1, problem: t(`cards.problems.${problem}`) }),
      onSelect: () => goTo(card.id, CARD_FIELD_OF[problem]),
    })),
  );

  const addCard = () => {
    const card = blankCard(cards.length);
    setCards((prev) => [...prev, card]);
    setOpenId(card.id);
  };

  const drop = useCallback((id: string) => {
    flushers.current.delete(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const gone = useCallback(
    (id: string) => {
      drop(id);
      setNotice("cardGone");
    },
    [drop],
  );

  const markPersisted = useCallback((id: string) => {
    persistedIds.current.add(id);
    setPersisted((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Waits for the card's in-flight save first: a first save that lands after
  // a local drop would bring the card back on the server.
  const remove = async (id: string) => {
    if (removing.current.has(id)) return;
    removing.current.add(id);
    setNotice(null);
    try {
      await flushers.current.get(id)?.();
      if (!persistedIds.current.has(id)) {
        drop(id);
        return;
      }
      const result = await removeCard(locale, id);
      if (result.ok || result.errorKey === "cardGone") drop(id);
      else setNotice(result.errorKey);
    } catch {
      setNotice("generic");
    } finally {
      removing.current.delete(id);
    }
  };

  // A card with nothing in it goes at once; anything entered is asked about.
  const requestRemove = (card: DraftCard) => {
    if (hasContent(card)) setConfirmId(card.id);
    else void remove(card.id);
  };

  const next = async () => {
    setNotice(null);
    const incomplete = cards.find((c) => cardProblems(c, catalog).length > 0);
    if (incomplete) {
      const [first] = orderedCardProblems(cardProblems(incomplete, catalog));
      goTo(incomplete.id, CARD_FIELD_OF[first]);
      return;
    }
    if (cards.length === 0) return;
    setLeaving(true);
    const results = await Promise.all([...flushers.current.values()].map((flush) => flush()));
    if (results.every(Boolean)) {
      router.push("/submit/shipping");
      return;
    }
    setLeaving(false);
    setNotice((current) => current ?? "nextFailed");
  };

  const atLimit = cards.length >= MAX_CARDS_PER_ORDER;
  const confirming = cards.find((c) => c.id === confirmId);

  return (
    <div className="grid gap-8 pb-36 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <div className="flex flex-col gap-4">
        {cards.map((card, index) => (
          <CardSlot
            key={card.id}
            card={card}
            number={index + 1}
            title={titleOf(card)}
            serviceLine={serviceLine(card)}
            catalog={catalog}
            quotePrice={quote.cards.find((q) => q.cardId === card.id)?.priceCents ?? null}
            open={openId === card.id}
            saved={persisted.has(card.id)}
            showAllProblems={revealId === card.id}
            onOpen={() => setOpenId(card.id)}
            onChange={(next) =>
              setCards((prev) =>
                prev.map((c) => (c.id === next.id ? { ...next, position: c.position } : c)),
              )
            }
            onPhoto={(photo) =>
              setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, photo } : c)))
            }
            onRemove={() => requestRemove(card)}
            onGone={() => gone(card.id)}
            onPersisted={() => markPersisted(card.id)}
            register={(flush) => {
              if (flush) flushers.current.set(card.id, flush);
              else flushers.current.delete(card.id);
            }}
          />
        ))}

        <button
          type="button"
          onClick={addCard}
          disabled={atLimit}
          className="focus-ring min-h-14 cursor-pointer rounded-card border border-dashed border-hairline bg-transparent px-4 font-semibold text-ink transition-colors duration-150 hover:border-gold-line disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("cards.addCard")}
        </button>
        {atLimit && (
          <p className="text-sm m-0 text-muted">{t("cards.cardLimit", { max: MAX_CARDS_PER_ORDER })}</p>
        )}

        {notice && (
          <p role="alert" className="text-sm font-medium text-ink">
            {notice === "nextFailed" ? t("cards.nextFailed") : t(`errors.${notice}`, { max: MAX_CARDS_PER_ORDER })}
          </p>
        )}
      </div>

      <RunningTotal
        quote={quote}
        cardCount={cards.length}
        lines={cards.map((card) => ({ id: card.id, title: titleOf(card), detail: serviceLine(card) }))}
        todos={todos}
        action={
          <Button type="button" onClick={next} disabled={leaving || cards.length === 0} className="w-full">
            {t("cards.next")}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirming !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
        title={t("cards.removeConfirm.title", { name: confirming ? titleOf(confirming) : "" })}
        description={t("cards.removeConfirm.body")}
        confirmLabel={t("cards.removeConfirm.confirm")}
        cancelLabel={t("cards.removeConfirm.cancel")}
        onConfirm={() => {
          if (confirming) void remove(confirming.id);
        }}
      />
    </div>
  );
}

function CardSlot({
  card,
  number,
  title,
  serviceLine,
  catalog,
  quotePrice,
  open,
  saved,
  showAllProblems,
  onOpen,
  onChange,
  onPhoto,
  onRemove,
  onGone,
  onPersisted,
  register,
}: {
  card: DraftCard;
  number: number;
  title: string;
  serviceLine: string | null;
  catalog: Catalog;
  quotePrice: number | null;
  open: boolean;
  saved: boolean;
  showAllProblems: boolean;
  onOpen: () => void;
  onChange: (card: DraftCard) => void;
  onPhoto: (photo: DraftCard["photo"]) => void;
  onRemove: () => void;
  onGone: () => void;
  onPersisted: () => void;
  register: (flush: Flusher | null) => void;
}) {
  const t = useTranslations("submit");
  const format = useFormatter();
  const locale = useLocale();

  // The photo is stored by its own action, so it is not part of what autosaves.
  const { photo: _photo, ...rest } = card;
  void _photo;
  const key = JSON.stringify(rest);
  const value = useMemo(() => JSON.parse(key) as Omit<DraftCard, "photo">, [key]);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const persistedRef = useRef(saved);

  const { status, errorKey, flush } = useAutosave(value, async (v) => {
    const result = await saveCard(locale, { ...v, persisted: persistedRef.current });
    if (result.ok) {
      persistedRef.current = true;
      onPersisted();
    }
    return result;
  });

  // A photo hangs from a stored card. An untouched card has never autosaved,
  // so choosing a photo on it saves it here first.
  const ensureSaved = useCallback(async () => {
    if (persistedRef.current) return true;
    await flush();
    if (persistedRef.current) return true;
    try {
      const result = await saveCard(locale, { ...latest.current, persisted: false });
      if (!result.ok) return false;
      persistedRef.current = true;
      onPersisted();
      return true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onPersisted` is recreated every render
  }, [flush, locale]);

  // `flush` is stable, so this registers once per slot.
  useEffect(() => {
    register(flush);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `register` is recreated every render
  }, [flush]);

  useEffect(() => {
    if (errorKey === "cardGone") onGone();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per error, not per callback identity
  }, [errorKey]);

  const problems = cardProblems(card, catalog);
  const summary = [card.setName?.trim(), card.cardNumber?.trim(), serviceLine].filter(Boolean).join(" · ");
  const price =
    quotePrice === null
      ? null
      : format.number(quotePrice / 100, { style: "currency", currency: catalog.currency });

  return (
    <section aria-label={t("cards.cardLabel", { number })} data-card={card.id}>
      <Card className="overflow-hidden">
        {open ? (
          <div className="flex items-center justify-between gap-4 border-b border-hairline-faint px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <p className="m-0 font-mono text-label uppercase text-muted">
                {t("cards.cardLabel", { number })}
              </p>
              <p className="m-0 truncate font-serif text-h3 text-ink">{title}</p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="focus-ring text-sm flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-2 text-muted transition-colors duration-150 hover:text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-[18px]">
                <path
                  d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("cards.remove")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
            {card.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- same-origin, owner-only photo route
              <img
                src={`/api/photos/${card.photo.id}`}
                alt=""
                className="aspect-[5/7] w-11 shrink-0 rounded-[6px] border border-hairline object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="aspect-[5/7] w-11 shrink-0 rounded-[6px] border border-hairline bg-surface-sunken"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 font-mono text-label uppercase text-muted">
                {t("cards.cardLabel", { number })}
              </p>
              <p className="m-0 truncate font-semibold text-ink">{title}</p>
              {summary && <p className="text-sm m-0 truncate text-muted">{summary}</p>}
            </div>
            {problems.length > 0 && (
              <span className="rounded-full bg-gold-soft px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gold-ink">
                {t("cards.needsDetails")}
              </span>
            )}
            {price && <span className="font-semibold text-ink">{price}</span>}
            <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
              {t("cards.edit")}
            </Button>
          </div>
        )}

        {open && (
          <CardEditor
            card={card}
            catalog={catalog}
            ensureSaved={ensureSaved}
            showAllProblems={showAllProblems}
            onChange={onChange}
            onPhoto={onPhoto}
            onGone={onGone}
          />
        )}

        <p role="status" className="text-sm m-0 min-h-5 px-5 pb-3 text-muted empty:hidden sm:px-6">
          {status === "saving" && t("autosave.saving")}
          {status === "saved" && t("autosave.saved")}
          {status === "error" && errorKey !== "cardGone" && (
            <>
              {t("autosave.error")}
              {errorKey && errorKey !== "generic" ? ` ${t(`errors.${errorKey}`, { max: MAX_CARDS_PER_ORDER })}` : ""}
            </>
          )}
        </p>
      </Card>
    </section>
  );
}
