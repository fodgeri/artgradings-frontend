"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { removeCard, saveCard } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { MAX_CARDS_PER_ORDER, cardProblems } from "@/lib/orders/card-rules";
import type { OrderErrorKey } from "@/lib/orders/errors";
import { quoteDraft } from "@/lib/orders/pricing";
import type { Catalog, Draft, DraftCard, DraftShipping } from "@/lib/orders/types";

import { CardEditor } from "./card-editor";
import { RunningTotal } from "./running-total";
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
    id: crypto.randomUUID(),
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

type Flusher = () => Promise<boolean>;

/** Step 1: the card list. Each card autosaves on its own; Next waits for all of them. */
export function CardsStep({
  initialDraft,
  catalog,
}: {
  initialDraft: Draft | null;
  catalog: Catalog;
}) {
  const t = useTranslations("submit");
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

  const complete = cards.length > 0 && cards.every((c) => cardProblems(c, catalog).length === 0);

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

  const next = async () => {
    setNotice(null);
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

  return (
    <div className="grid gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <div className="flex flex-col gap-4">
        {cards.map((card, index) => (
          <CardSlot
            key={card.id}
            card={card}
            number={index + 1}
            catalog={catalog}
            quotePrice={quote.cards.find((q) => q.cardId === card.id)?.priceCents ?? null}
            open={openId === card.id}
            saved={persisted.has(card.id)}
            onOpen={() => setOpenId(card.id)}
            onChange={(next) =>
              setCards((prev) =>
                prev.map((c) => (c.id === next.id ? { ...next, position: c.position } : c)),
              )
            }
            onPhoto={(photo) =>
              setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, photo } : c)))
            }
            onRemove={() => void remove(card.id)}
            onGone={() => gone(card.id)}
            onPersisted={() => markPersisted(card.id)}
            register={(flush) => {
              if (flush) flushers.current.set(card.id, flush);
              else flushers.current.delete(card.id);
            }}
          />
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" onClick={addCard} disabled={atLimit}>
            {t("cards.addCard")}
          </Button>
          {atLimit && (
            <p className="text-sm text-muted">{t("cards.cardLimit", { max: MAX_CARDS_PER_ORDER })}</p>
          )}
        </div>

        {notice && (
          <p role="alert" className="text-sm font-medium text-ink">
            {notice === "nextFailed" ? t("cards.nextFailed") : t(`errors.${notice}`, { max: MAX_CARDS_PER_ORDER })}
          </p>
        )}
      </div>

      <RunningTotal
        quote={quote}
        cardCount={cards.length}
        action={
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={next} disabled={!complete || leaving}>
              {t("cards.next")}
            </Button>
            {!complete && <p className="text-sm text-muted">{t("cards.incomplete")}</p>}
          </div>
        }
      />
    </div>
  );
}

function CardSlot({
  card,
  number,
  catalog,
  quotePrice,
  open,
  saved,
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
  catalog: Catalog;
  quotePrice: number | null;
  open: boolean;
  saved: boolean;
  onOpen: () => void;
  onChange: (card: DraftCard) => void;
  onPhoto: (photo: DraftCard["photo"]) => void;
  onRemove: () => void;
  onGone: () => void;
  onPersisted: () => void;
  register: (flush: Flusher | null) => void;
}) {
  const t = useTranslations("submit");
  const tCatalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();

  // The photo is stored by its own action, so it is not part of what autosaves.
  const { photo: _photo, ...rest } = card;
  void _photo;
  const key = JSON.stringify(rest);
  const value = useMemo(() => JSON.parse(key) as Omit<DraftCard, "photo">, [key]);

  const persistedRef = useRef(saved);

  const { status, errorKey, flush } = useAutosave(value, async (v) => {
    const result = await saveCard(locale, { ...v, persisted: persistedRef.current });
    if (result.ok) {
      persistedRef.current = true;
      onPersisted();
    }
    return result;
  });

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
  const serviceKey = card.service ? `services.${card.service}.label` : null;
  const serviceLabel =
    serviceKey && (tCatalog.has(serviceKey as never) ? tCatalog(serviceKey as never) : serviceKey);
  const title = card.name?.trim() || (card.identifiedBy === "art" ? t("cards.unknownSummary") : t("cards.untitled"));

  return (
    <section aria-label={t("cards.cardLabel", { number })}>
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-label uppercase text-muted">
              {t("cards.cardLabel", { number })}
            </p>
            <p className="truncate font-serif text-h3 text-ink">{title}</p>
            {!open && (
              <p className="text-sm text-muted">
                {[card.setName, serviceLabel, quotePrice !== null
                  ? format.number(quotePrice / 100, { style: "currency", currency: catalog.currency })
                  : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!open && problems.length > 0 && (
              <span className="text-sm text-muted">{t("cards.needsDetails")}</span>
            )}
            {!open && (
              <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
                {t("cards.edit")}
              </Button>
            )}
          </div>
        </div>

        {open && (
          <CardEditor
            card={card}
            catalog={catalog}
            saved={saved}
            onChange={onChange}
            onPhoto={onPhoto}
            onRemove={onRemove}
            onGone={onGone}
          />
        )}

        <p role="status" className="mt-3 min-h-5 text-sm text-muted">
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
