import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { DemoStoreService } from "../common/demo-store.service";
import { EventsService } from "../events/events.service";
import { MockApiPayProvider } from "./payment-provider";

@UseGuards(DemoAuthGuard)
@Controller("payments")
export class PaymentsController {
  private readonly provider = new MockApiPayProvider();

  constructor(
    @Inject(DemoStoreService) private readonly store: DemoStoreService,
    @Inject(EventsService) private readonly events: EventsService
  ) {}

  @Post("initiate")
  @Roles("CUSTOMER", "OWNER_STAFF")
  async initiate(@Req() req: Request, @Body() body: { bookingId: string }) {
    const booking = this.store.assertCanAccessBooking(req.user!, body.bookingId);
    const intent = await this.provider.createPaymentIntent({ bookingId: booking.id, amount: booking.grandTotal });
    const payment = this.store.upsertPayment(booking.id, intent);
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }

  @Post("callback")
  async callback(@Body() body: Record<string, unknown>) {
    const verified = await this.provider.verifyCallback(body);
    const booking = this.store.getBooking(verified.bookingId);
    const payment = this.store.upsertPayment(booking.id, {
      provider: "mock-apipay",
      providerRef: verified.providerRef,
      status: verified.status,
      amount: booking.grandTotal
    });
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }

  @Get(":bookingId/status")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN")
  status(@Req() req: Request, @Param("bookingId") bookingId: string) {
    return this.store.assertCanAccessBooking(req.user!, bookingId).payment ?? null;
  }

  @Post(":bookingId/manual-paid")
  @Roles("OWNER_STAFF", "ADMIN")
  async manualPaid(@Req() req: Request, @Param("bookingId") bookingId: string) {
    const booking = this.store.assertCanAccessBooking(req.user!, bookingId);
    const payment = this.store.upsertPayment(booking.id, {
      provider: "manual",
      providerRef: `manual_${booking.id}`,
      status: "PAID",
      amount: booking.grandTotal
    });
    await this.events.publish("payment.updated", { bookingId: booking.id, status: payment.status });
    return payment;
  }
}
