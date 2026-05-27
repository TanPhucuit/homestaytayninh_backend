import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentStatus } from "../common/domain";

export interface PaymentIntent {
  provider: string;
  providerRef: string;
  status: PaymentStatus;
  amount: number;
  checkoutUrl: string;
  qrUrl?: string;
}

export interface PaymentProvider {
  createPaymentIntent(input: { bookingId: string; amount: number }): Promise<PaymentIntent>;
  registerWebhook(): Promise<Record<string, unknown>>;
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

  async registerWebhook(): Promise<Record<string, unknown>> {
    return { provider: "mock-apipay", registered: false };
  }

  async getStatus(): Promise<PaymentStatus> {
    return "PENDING";
  }
}

export class ApiPayHttpProvider implements PaymentProvider {
  constructor(private readonly config: ConfigService) {}

  async createPaymentIntent(input: { bookingId: string; amount: number }): Promise<PaymentIntent> {
    const baseUrl = this.config.get<string>("APIPAY_BASE_URL") || "https://app.apipay.vn";
    const path = this.paymentRequestPath();
    const bankPublicId = this.required("APIPAY_BANK_PUBLIC_ID");
    const payload = {
      bankPublicId,
      amount: input.amount,
      content: input.bookingId,
      title: `Thanh toán đặt phòng ${input.bookingId}`,
      redirectUrl: this.redirectUrl(input.bookingId)
    };
    const body = JSON.stringify(payload);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.credentials()}`
      },
      body
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(this.describeApiPayError(response.status, data));
    }

    const result = this.unwrapData(data);
    const providerRef = String(result.paymentRequestId ?? result.providerRef ?? result.paymentId ?? result.id ?? input.bookingId);
    const checkoutUrl = String(result.payUrl ?? result.checkoutUrl ?? result.paymentUrl ?? result.url ?? "");
    if (!checkoutUrl) {
      throw new Error(`ApiPay did not return a checkout/payment URL. Response keys: ${Object.keys(result).join(", ") || "none"}`);
    }

    return {
      provider: "apipay",
      providerRef,
      status: normalizePaymentStatus(result.status ?? data.status ?? "PENDING"),
      amount: input.amount,
      checkoutUrl,
      qrUrl: typeof result.qrUrl === "string" ? result.qrUrl : undefined
    };
  }

  async verifyCallback(payload: Record<string, unknown>) {
    const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
    const event = String(payload.event ?? "").toLowerCase();
    const type = String(data.type ?? "").toUpperCase();
    const status = event === "transaction.in" || type === "IN" ? "PAID" : parseCallbackStatus(data.status ?? payload.status ?? "PENDING");
    const bookingId = String(data.content ?? data.referenceCode ?? payload.bookingId ?? payload.orderId ?? "").trim();
    if (!bookingId) {
      throw new BadRequestException("ApiPay webhook is missing booking reference");
    }

    return {
      bookingId,
      status,
      providerRef: String(data.transactionId ?? data.paymentRequestId ?? payload.providerRef ?? payload.paymentId ?? payload.id ?? bookingId),
      provider: "apipay"
    };
  }

  async registerWebhook(): Promise<Record<string, unknown>> {
    const baseUrl = this.config.get<string>("APIPAY_BASE_URL") || "https://app.apipay.vn";
    const path = this.config.get<string>("APIPAY_WEBHOOK_CREATE_PATH") ?? "/v1/client/webhooks";
    const payload = {
      webhookUrl: this.required("APIPAY_CALLBACK_URL"),
      bankPublicId: this.required("APIPAY_BANK_PUBLIC_ID"),
      type: this.config.get<string>("APIPAY_WEBHOOK_TYPE") ?? "IN"
    };
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.credentials()}`
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(data.message ?? data.error ?? `ApiPay webhook request failed with ${response.status}`));
    }
    return data;
  }

  async getStatus(): Promise<PaymentStatus> {
    return "PENDING";
  }

  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is required when PAYMENT_PROVIDER=apipay`);
    return value;
  }

  private unwrapData(data: Record<string, unknown>) {
    return data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : data;
  }

  private describeApiPayError(status: number, data: Record<string, unknown>) {
    const message = data.message ?? data.error ?? data.errors ?? data;
    return `ApiPay request failed with ${status}: ${JSON.stringify(message)}`;
  }

  private paymentRequestPath() {
    const configured = this.config.get<string>("APIPAY_CREATE_PAYMENT_PATH") ?? "/v1/client/payment-requests";
    return configured.replace(/\/create\/?$/, "");
  }

  private credentials() {
    const accessKey = this.required("APIPAY_ACCESS_KEY");
    const secretKey = this.required("APIPAY_SECRET_KEY");
    return Buffer.from(`${accessKey}:${secretKey}`, "utf8").toString("base64");
  }

  private redirectUrl(bookingId: string) {
    const fallback = "https://homestaytayninh-frontend.vercel.app/payment/result";
    const configured = this.config.get<string>("APIPAY_RETURN_URL") || this.config.get<string>("FRONTEND_URL") || fallback;
    const url = new URL(configured.endsWith("/payment/result") ? configured : `${configured.replace(/\/$/, "")}/payment/result`);
    url.searchParams.set("bookingId", bookingId);
    url.searchParams.set("status", "pending");
    return url.toString();
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

  registerWebhook() {
    return this.provider.registerWebhook();
  }

  verifyCallback(payload: Record<string, unknown>) {
    return this.provider.verifyCallback(payload);
  }

  getStatus(providerRef: string) {
    return this.provider.getStatus(providerRef);
  }
}
