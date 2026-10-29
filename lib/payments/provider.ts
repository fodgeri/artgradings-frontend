export type PaymentProviderId = "fake";

export type PaymentProvider = {
  id: PaymentProviderId;
  /** Starts a payment for a submitted order and returns where to send the customer. */
  startPayment(order: { reference: string }): Promise<string>;
};

/** No provider is configured yet; Task 13 replaces this body. */
export function getPaymentProvider(): PaymentProvider | null {
  return null;
}
