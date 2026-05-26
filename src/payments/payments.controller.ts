import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Public, Roles } from "../common/auth.decorator";
import { SupabaseAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { EventsService } from "../events/events.service";
import { PaymentProviderService } from "./payment-provider";

@UseGuards(SupabaseAuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PaymentProviderService) private readonly provider: PaymentProviderService
  ) {}

  @Post("initiate")
  @Roles("CUSTOMER", "OWNER_STAFF", "ADMIN")
  async initiate(@Req() req: Request, @Body() body: { bookingId: string }) {
    const booking = await this.store.assertCanAccessBooking(req.user!, body.bookingId);
    const intent = await this.provider.createPaymentIntent({ bookingId: booking.id, amount: booking.grandTotal });
    const payment = await this.store.upsertPayment(booking.id, intent, req.user!.id);
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }

  @Post("callback")
  @Public()
  async callback(@Body() body: Record<string, unknown>) {
    const verified = await this.provider.verifyCallback(body);
    const booking = await this.store.assertCanAccessBooking(
      { id: "system", name: "Payment webhook", email: "webhook@system.local", role: "ADMIN", banned: false },
      verified.bookingId
    );
    const payment = await this.store.upsertPayment(booking.id, {
      provider: verified.provider,
      providerRef: verified.providerRef,
      status: verified.status,
      amount: booking.grandTotal
    });
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
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
    const payment = await this.store.upsertPayment(booking.id, {
      provider: "manual",
      providerRef: `manual_${booking.id}`,
      status: "PAID",
      amount: booking.grandTotal
    }, req.user!.id);
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }
}
