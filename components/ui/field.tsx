import { Field as BaseField } from "@base-ui-components/react/field";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Shared control chrome for text inputs and selects. */
const controlClass =
  "focus-ring h-[50px] w-full appearance-none rounded-control border border-hairline bg-surface-raised px-3.5 font-sans text-[15px] text-ink transition-colors duration-150 placeholder:text-muted focus-visible:border-gold";

/**
 * A labelled form control.
 *
 * Base UI's Field generates the id and the `htmlFor` that binds them, and will
 * wire `aria-describedby` for descriptions and errors when M3 adds validation.
 * Nothing here should hand-roll those attributes.
 */
export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseField.Root className={cn("mb-[18px] flex flex-col gap-2", className)}>
      <BaseField.Label className="font-mono text-label uppercase text-muted">
        {label}
      </BaseField.Label>
      {children}
    </BaseField.Root>
  );
}

export function FieldInput({ className, ...props }: ComponentProps<"input">) {
  return <BaseField.Control className={cn(controlClass, className)} {...props} />;
}

/**
 * `Field.Control` is typed against `<input>`, so select-specific props cannot
 * be spread onto it — `onError` alone is enough to break the check. They go on
 * the rendered `<select>` instead, which is what `render` is for: Base UI
 * merges its generated id and ARIA onto that element.
 */
export function FieldSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <BaseField.Control
      render={<select {...props}>{children}</select>}
      className={cn(
        controlClass,
        "cursor-pointer bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>\")] bg-[position:right_16px_center] bg-no-repeat pr-10",
        className,
      )}
    />
  );
}
