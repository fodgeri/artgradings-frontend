import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

/**
 * The unauthenticated auth pages share one centred card. A route group, so
 * it changes no URL: `/sign-in`, not `/(auth)/sign-in`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Section>
      <Container>
        <Card className="mx-auto w-full max-w-[440px] p-6 sm:p-10">{children}</Card>
      </Container>
    </Section>
  );
}
