import { type AccordionItem, Accordion } from "@/components/ui/accordion";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";

/**
 * The FAQ band, rendered on the landing page with a slice and on `/faq` in
 * full. Thin, but it owns the band padding and the reading measure so neither
 * route repeats them.
 *
 * `heading` arrives as a resolved string and renders as an `h2` — never an
 * `h1`, because both routes supply their own and this section must not compete
 * for the document's single top-level heading.
 *
 * It is optional: on `/faq` the page's `h1` already introduces the accordion,
 * and repeating it as an `h2` immediately below would print the same words
 * twice. On the landing page the band needs its own heading, so it gets one.
 */
export function FaqSection({
  items,
  heading,
  eyebrow,
  footerLink,
}: {
  items: AccordionItem[];
  heading?: string;
  eyebrow?: string;
  footerLink?: { href: string; label: string };
}) {
  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-[760px]">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          {heading ? (
            <h2 className="mt-3 font-serif text-h2 text-ink">{heading}</h2>
          ) : null}

          <div className={heading || eyebrow ? "mt-10" : ""}>
            <Accordion items={items} />
          </div>

          {footerLink ? (
            <p className="mt-10">
              <Link
                href={footerLink.href}
                className="focus-ring text-sm font-semibold text-gold-ink hover:underline"
              >
                {footerLink.label} <span aria-hidden>→</span>
              </Link>
            </p>
          ) : null}
        </div>
      </Container>
    </Section>
  );
}
