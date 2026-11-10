"use client";

import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { Radio } from "@base-ui-components/react/radio";
import { RadioGroup } from "@base-ui-components/react/radio-group";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ChoiceCardOption = {
  value: string;
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  /** Drawn in place of the radio dot; the border alone then marks selection. */
  icon?: ReactNode;
  /** A small line above the figure, e.g. "from". */
  metaLabel?: ReactNode;
  /** Right-aligned figure, e.g. a price. */
  meta?: ReactNode;
  /** A quieter line under the figure, e.g. a turnaround. */
  metaDetail?: ReactNode;
  disabled?: boolean;
  /** Why the option is disabled. Shown, never hidden: it is the whole point. */
  disabledReason?: ReactNode;
};

const cardClass = cn(
  "focus-ring group flex cursor-pointer items-start gap-3.5 rounded-card border border-hairline bg-surface-raised p-4 text-left transition-colors duration-150",
  "hover:border-gold-line",
  "data-[checked]:border-gold data-[checked]:bg-gold-soft data-[checked]:shadow-[inset_0_0_0_1px_var(--ag-gold)]",
  "data-[disabled]:cursor-not-allowed data-[disabled]:hover:border-hairline",
);

function Body({
  titleId,
  detailId,
  metaId,
  option,
}: {
  titleId: string;
  detailId: string;
  metaId: string;
  option: Omit<ChoiceCardOption, "value" | "icon">;
}) {
  const hasMeta = option.metaLabel || option.meta || option.metaDetail;
  return (
    <span className="flex min-w-0 flex-1 items-start justify-between gap-x-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={titleId} className="font-semibold text-ink group-data-[disabled]:text-muted">
          {option.title}
        </span>
        <span id={detailId} className="text-sm flex flex-col gap-1 text-muted">
          {option.description ? <span>{option.description}</span> : null}
          {option.disabled && option.disabledReason ? (
            <span className="font-medium text-ink">{option.disabledReason}</span>
          ) : null}
        </span>
      </span>
      {hasMeta ? (
        <span
          id={metaId}
          className="flex shrink-0 flex-col items-end gap-0.5 text-right group-data-[disabled]:opacity-50"
        >
          {option.metaLabel ? <span className="text-sm text-muted">{option.metaLabel}</span> : null}
          {option.meta ? <span className="font-semibold text-ink">{option.meta}</span> : null}
          {option.metaDetail ? <span className="text-sm text-muted">{option.metaDetail}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A single-select group drawn as cards: every option stays visible with its
 * price and detail, and an unavailable one says why instead of vanishing.
 *
 * Base UI's RadioGroup supplies the roving focus and arrow keys. Each radio is
 * named by its title alone (`aria-labelledby`); everything else on the card —
 * the price and the disabled reason included — is its description.
 */
export function ChoiceCards({
  options,
  value,
  onValueChange,
  label,
  invalid = false,
  disabled = false,
  columns = 1,
  className,
}: {
  options: ChoiceCardOption[];
  /** `null` while nothing is chosen. */
  value: string | null;
  onValueChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  columns?: 1 | 2;
  className?: string;
}) {
  const id = useId();

  return (
    <RadioGroup
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      value={value ?? ""}
      disabled={disabled}
      onValueChange={(next) => onValueChange(String(next))}
      className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", className)}
    >
      {options.map((option, index) => {
        const titleId = `${id}-${index}-title`;
        const detailId = `${id}-${index}-detail`;
        const metaId = `${id}-${index}-meta`;
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-labelledby={titleId}
            aria-describedby={`${detailId} ${metaId}`}
            className={cardClass}
          >
            {option.icon ? (
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-ink group-data-[checked]:bg-surface-raised group-data-[checked]:text-gold-ink group-data-[disabled]:opacity-50"
              >
                {option.icon}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-raised transition-colors duration-150 group-data-[checked]:border-gold group-data-[checked]:bg-gold group-data-[disabled]:opacity-50"
              >
                <Radio.Indicator className="size-2 rounded-full bg-on-gold" />
              </span>
            )}
            <Body titleId={titleId} detailId={detailId} metaId={metaId} option={option} />
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/**
 * The same card around a checkbox, for optional extras. Controlled only, like
 * `Checkbox`: a paid extra can never start ticked by accident.
 */
export function ChoiceCheckCard({
  checked,
  onCheckedChange,
  title,
  description,
  meta,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const detailId = `${id}-detail`;
  const metaId = `${id}-meta`;

  return (
    <BaseCheckbox.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-labelledby={titleId}
      aria-describedby={`${detailId} ${metaId}`}
      className={cn(cardClass, "w-full", className)}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-hairline bg-surface-raised text-on-gold transition-colors duration-150 group-data-[checked]:border-gold group-data-[checked]:bg-gold group-data-[disabled]:opacity-50"
      >
        <BaseCheckbox.Indicator>
          <svg viewBox="0 0 12 12" className="size-3" fill="none">
            <path
              d="M2.5 6.5 5 9l4.5-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BaseCheckbox.Indicator>
      </span>
      <Body
        titleId={titleId}
        detailId={detailId}
        metaId={metaId}
        option={{ title, description, meta, disabled }}
      />
    </BaseCheckbox.Root>
  );
}
