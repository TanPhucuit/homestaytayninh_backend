import { BadGatewayException, BadRequestException, Body, Controller, Get, Inject, Logger, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Booking, PaymentStatus } from "../common/domain";
import { Public, Roles } from "../common/auth.decorator";
import { RedisSessionAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { EventsService } from "../events/events.service";
import { PaymentProviderService } from "./payment-provider";

@UseGuards(RedisSessionAuthGuard)
@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  private readonly payableBookingStatuses = new Set<Booking["status"]>(["PENDING", "CONFIRMED", "IN_STAY"]);
  private readonly retryablePaymentStatuses = new Set<PaymentStatus>(["INITIATED", "PENDING", "FAILED", "CANCELLED"]);

  constructor(
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PaymentProviderService) private readonly provider: PaymentProviderService
  ) {}

  @Post("initiate")
  @Roles("CUSTOMER", "OWNER_STAFF", "ADMIN")
  async initiate(@Req() req: Request, @Body() body: { bookingId: string }) {
    const booking = await this.store.assertCanAccessBooking(req.user!, body.bookingId);
    if (!this.canCreatePayment(booking)) {
      throw new BadRequestException("Đơn này không còn trong trạng thái có thể thanh toán.");
    }
    let intent: Awaited<ReturnType<PaymentProviderService["createPaymentIntent"]>>;
    try {
      intent = await this.provider.createPaymentIntent({ bookingId: booking.id, amount: booking.grandTotal });
      this.logger.log(`Payment link created for booking=${booking.id} amount=${booking.grandTotal} provider=${intent.provider}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment link creation failed for booking=${booking.id} amount=${booking.grandTotal}: ${message}`);
      throw new BadGatewayException("Không thể tạo liên kết thanh toán lúc này. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.");
    }
    const payment = await this.store.upsertPayment(booking.id, intent, req.user!.id);
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }

  @Post("callback")
  @Public()
  async callback(@Body() body: Record<string, unknown>) {
    void this.processWebhook(body);
    return { received: true };
  }

  @Post("apipay/webhook")
  @Public()
  async apipayWebhook(@Body() body: Record<string, unknown>) {
    void this.processWebhook(body);
    return { received: true };
  }

  @Post("apipay/webhooks")
  @Roles("ADMIN")
  async registerApiPayWebhook() {
    return this.provider.registerWebhook();
  }

  private async processWebhook(body: Record<string, unknown>) {
    try {
      const verified = await this.provider.verifyCallback(body);
      const systemUser = { id: "system", name: "Payment webhook", email: "webhook@system.local", role: "ADMIN" as const, banned: false };
      const booking = verified.bookingId
        ? await this.store.assertCanAccessBooking(systemUser, verified.bookingId)
        : await this.store.bookingByPaymentProviderRef(verified.provider, verified.providerRef);
      if (!booking) throw new Error(`No booking matched ApiPay webhook providerRef=${verified.providerRef}`);
      if (booking.status === "CANCELLED" && verified.status !== "CANCELLED") {
        this.logger.warn(`ApiPay webhook ignored for cancelled booking=${booking.id} incomingStatus=${verified.status} providerRef=${verified.providerRef}`);
        return;
      }
      const payment = await this.store.upsertPayment(booking.id, {
        provider: verified.provider,
        providerRef: verified.providerRef,
        status: verified.status,
        amount: booking.grandTotal
      });
      await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
      this.logger.log(`ApiPay webhook applied booking=${booking.id} status=${payment.status} providerRef=${verified.providerRef}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ApiPay webhook processing failed: ${message}`);
    }
  }

  @Get(":bookingId/status")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN")
  async status(@Req() req: Request, @Param("bookingId") bookingId: string) {
    return (await this.store.assertCanAccessBooking(req.user!, bookingId)).payment ?? null;
  }

  @Post(":bookingId/manual-paid")
  @Roles("OWNER_STAFF", "ADMIN")
  async manualPaid(@Req() req: Request, @Param("bookingId") bookingId: string) {
    const booking = await this.store.assertCanAccessBooking(req.user!, bookingId);
    if (!this.payableBookingStatuses.has(booking.status)) {
      throw new BadRequestException("Đơn này không còn trong trạng thái có thể ghi nhận thanh toán.");
    }
    const payment = await this.store.upsertPayment(booking.id, {
      provider: "manual",
      providerRef: `manual_${booking.id}`,
      status: "PAID",
      amount: booking.grandTotal
    }, req.user!.id);
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }

  private canCreatePayment(booking: Booking) {
    return this.payableBookingStatuses.has(booking.status) && (!booking.payment || this.retryablePaymentStatuses.has(booking.payment.status));
  }
}
