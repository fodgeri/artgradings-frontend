"use client";

import { Accordion as BaseAccordion } from "@base-ui-components/react/accordion";

import { cn } from "@/lib/cn";

export type AccordionItem = { id: string; question: string; answer: string };

/**
 * The FAQ list. The design's `+` / `−` sign is rendered with CSS rather than
 * two glyphs so assistive technology reads only the question text — the state
 * is already carried by `aria-expanded`.
 */
export function Accordion({
  items,
  className,
}: {
  items: AccordionItem[];
  className?: string;
}) {
  return (
    <BaseAccordion.Root className={cn("border-t border-hairline", className)}>
      {items.map((item) => (
        <BaseAccordion.Item key={item.id} className="border-b border-hairline">
          <BaseAccordion.Header>
            <BaseAccordion.Trigger
              className={cn(
                "focus-ring group flex w-full cursor-pointer items-center justify-between gap-6 bg-transparent px-1 py-6 text-left text-lg font-semibold text-ink transition-colors duration-150",
                "hover:text-gold-ink",
              )}
            >
              {item.question}
              <span
                aria-hidden
                className="w-5 shrink-0 text-center font-mono text-xl text-gold-ink after:content-['+'] group-data-[panel-open]:after:content-['−']"
              />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="max-w-[780px] px-1 pb-[26px] text-base leading-[1.65] text-muted">
            {item.answer}
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}
