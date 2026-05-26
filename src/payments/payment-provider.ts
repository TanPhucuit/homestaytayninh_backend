import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
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
  verifyCallback(payload: Record<string, unknown>): Promise<{ bookingId: string; status: PaymentStatus; providerRef: string; provider: string }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  const status = String(value ?? "PENDING").toUpperCase();
  if (status === "PAID" || status === "SUCCESS" || status === "SUCCEEDED") return "PAID";
  if (status === "FAILED" || status === "ERROR") return "FAILED";
  if (status === "CANCELLED" || status === "CANCELED" || status === "EXPIRED") return "CANCELLED";
  if (status === "INITIATED") return "INITIATED";
  return "PENDING";
}

function parseCallbackStatus(value: unknown): PaymentStatus {
  const status = String(value ?? "").toUpperCase();
  if (status === "PAID" || status === "SUCCESS" || status === "SUCCEEDED") return "PAID";
  if (status === "PENDING") return "PENDING";
  if (status === "FAILED" || status === "ERROR") return "FAILED";
  if (status === "CANCELLED" || status === "CANCELED" || status === "EXPIRED") return "CANCELLED";
  if (status === "INITIATED") return "INITIATED";
  throw new BadRequestException("Invalid payment status");
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

  async verifyCallback(
    _payload: Record<string, unknown>,
  ): Promise<{ bookingId: string; status: PaymentStatus; providerRef: string; provider: string }> {
    throw new BadRequestException("Payment callbacks are disabled while PAYMENT_PROVIDER=mock-apipay");
  }

  async getStatus(): Promise<PaymentStatus> {
    return "PENDING";
  }
}

export class ApiPayHttpProvider implements PaymentProvider {
  constructor(private readonly config: ConfigService) {}

  async createPaymentIntent(input: { bookingId: string; amount: number }): Promise<PaymentIntent> {
    const baseUrl = this.required("APIPAY_BASE_URL");
    const accessKey = this.required("APIPAY_ACCESS_KEY");
    const secretKey = this.required("APIPAY_SECRET_KEY");
    const path = this.config.get<string>("APIPAY_CREATE_PAYMENT_PATH") ?? "/payments";
    const currency = this.config.get<string>("APIPAY_CURRENCY") ?? "VND";
    const payload = {
      orderId: input.bookingId,
      amount: input.amount,
      currency,
      description: `Homestay Tay Ninh booking ${input.bookingId}`,
      returnUrl: this.config.get<string>("APIPAY_RETURN_URL"),
      callbackUrl: this.config.get<string>("APIPAY_CALLBACK_URL")
    };
    const body = JSON.stringify(payload);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-key": accessKey,
        "x-signature": this.sign(body, secretKey)
      },
      body
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(data.message ?? data.error ?? `ApiPay request failed with ${response.status}`));
    }

    const providerRef = String(data.providerRef ?? data.paymentId ?? data.id ?? input.bookingId);
    const checkoutUrl = String(data.checkoutUrl ?? data.paymentUrl ?? data.url ?? "");
    if (!checkoutUrl) {
      throw new Error("ApiPay did not return a checkout/payment URL");
    }

    return {
      provider: "apipay",
      providerRef,
      status: normalizePaymentStatus(data.status),
      amount: input.amount,
      checkoutUrl
    };
  }

  async verifyCallback(payload: Record<string, unknown>) {
    return {
      bookingId: String(payload.bookingId ?? payload.orderId),
      status: parseCallbackStatus(payload.status),
      providerRef: String(payload.providerRef ?? payload.paymentId ?? payload.id ?? payload.orderId),
      provider: "apipay"
    };
  }

  async getStatus(): Promise<PaymentStatus> {
    return "PENDING";
  }

  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is required when PAYMENT_PROVIDER=apipay`);
    return value;
  }

  private sign(payload: string, secret: string) {
    return createHmac("sha256", secret).update(payload).digest("base64");
  }
}

@Injectable()
export class PaymentProviderService implements PaymentProvider {
  private readonly provider: PaymentProvider;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const configuredProvider = (config.get<string>("PAYMENT_PROVIDER") || "mock-apipay").trim();
    if (configuredProvider === "apipay") {
      this.provider = new ApiPayHttpProvider(config);
    } else if (configuredProvider === "mock-apipay") {
      this.provider = new MockApiPayProvider();
    } else {
      throw new Error(`PAYMENT_PROVIDER must be apipay or mock-apipay. Received: ${configuredProvider}`);
    }
  }

  createPaymentIntent(input: { bookingId: string; amount: number }) {
    return this.provider.createPaymentIntent(input);
  }

  verifyCallback(payload: Record<string, unknown>) {
    return this.provider.verifyCallback(payload);
  }

  getStatus(providerRef: string) {
    return this.provider.getStatus(providerRef);
  }
}
