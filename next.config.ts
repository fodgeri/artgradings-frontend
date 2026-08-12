import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server.js plus only the
  // node_modules it actually needs. This is what the Docker runtime stage
  // copies; without it the image build fails at the COPY step.
  output: "standalone",
};

// Resolves ./i18n/request.ts by convention.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
