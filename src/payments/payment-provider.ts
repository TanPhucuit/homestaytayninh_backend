import { PaymentStatus } from "../common/domain";

export interface PaymentIntent {
  provider: string;
  providerRef: string;
  status: PaymentStatus;
  amount: number;
  checkoutUrl: string;
}

export interface PaymentProvider {
  createPaymentIntent(input: { bookingId: string; amount: number }): Promise<PaymentIntent>;
  verifyCallback(payload: Record<string, unknown>): Promise<{ bookingId: string; status: PaymentStatus; providerRef: string }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
}

export class MockApiPayProvider implements PaymentProvider {
  async createPaymentIntent(input: { bookingId: string; amount: number }): Promise<PaymentIntent> {
    return {
      provider: "mock-apipay",
      providerRef: `mock_${input.bookingId}`,
      status: "PENDING",
      amount: input.amount,
      checkoutUrl: `/bookings?payment=mock_${input.bookingId}`
    };
  }

  async verifyCallback(payload: Record<string, unknown>) {
    return {
      bookingId: String(payload.bookingId),
      status: String(payload.status ?? "PAID") as PaymentStatus,
      providerRef: String(payload.providerRef ?? `mock_${payload.bookingId}`)
    };
  }

  async getStatus(): Promise<PaymentStatus> {
    return "PENDING";
  }
}
