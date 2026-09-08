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
 * `heading` arrives as a resolved string and always renders as an `h2`: both
 * routes supply their own `h1`, so this section must never compete for the
 * document's single top-level heading.
 */
export function FaqSection({
  items,
  heading,
  eyebrow,
  footerLink,
}: {
  items: AccordionItem[];
  heading: string;
  eyebrow?: string;
  footerLink?: { href: string; label: string };
}) {
  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-[760px]">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="mt-3 font-serif text-h2 text-ink">{heading}</h2>

          <div className="mt-10">
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
