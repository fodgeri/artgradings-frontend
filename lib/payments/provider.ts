export type PaymentProviderId = "fake";

export type PaymentProvider = {
  id: PaymentProviderId;
  /** Starts a payment for a submitted order and returns where to send the customer (locale-less). */
  startPayment(order: { reference: string }): Promise<string>;
};

const fake: PaymentProvider = {
  id: "fake",
  async startPayment({ reference }) {
    return `/account/orders/${reference}/pay`;
  },
};

/**
 * The configured provider, from the runtime setting `PAYMENT_PROVIDER` — never
 * a `NEXT_PUBLIC_*` value, so it can differ per host without a rebuild. Unset
 * (or unknown) means no provider: the test payment page and its actions 404.
 */
export function getPaymentProvider(): PaymentProvider | null {
  return process.env.PAYMENT_PROVIDER === "fake" ? fake : null;
}
