import { Eyebrow } from "@/components/ui/eyebrow";
import { Kicker } from "@/components/ui/kicker";

export function TypeSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Typography</h2>
      <div className="mt-8 flex flex-col gap-8">
        <div>
          <Kicker>text-display · Newsreader</Kicker>
          <p className="mt-2 font-serif text-display text-ink">
            What your cards are worth, made certain.
          </p>
        </div>
        <div>
          <Kicker>text-h2 · Newsreader</Kicker>
          <p className="mt-2 font-serif text-h2 text-ink">
            Four steps from mailbox to vaulted.
          </p>
        </div>
        <div>
          <Kicker>text-h3 · Newsreader</Kicker>
          <p className="mt-2 font-serif text-h3 text-ink">Seal and return</p>
        </div>
        <div>
          <Kicker>text-lead · Hanken Grotesk</Kicker>
          <p className="mt-2 max-w-prose text-lead text-muted">
            A documented, insured chain of custody for every card.
          </p>
        </div>
        <div>
          <Kicker>Eyebrow and Kicker · JetBrains Mono</Kicker>
          <div className="mt-2 flex flex-col gap-2">
            <Eyebrow>Recently graded</Eyebrow>
            <Kicker>Order summary</Kicker>
          </div>
        </div>
      </div>
    </div>
  );
}
