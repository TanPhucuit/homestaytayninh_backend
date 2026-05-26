import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
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
    private readonly store: DemoStoreService,
    private readonly events: EventsService
  ) {}

  @Post("initiate")
  @Roles("CUSTOMER", "OWNER_STAFF")
  async initiate(@Body() body: { bookingId: string }) {
    const booking = this.store.getBooking(body.bookingId);
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
  status(@Param("bookingId") bookingId: string) {
    return this.store.getBooking(bookingId).payment ?? null;
  }

  @Post(":bookingId/manual-paid")
  @Roles("OWNER_STAFF", "ADMIN")
  async manualPaid(@Param("bookingId") bookingId: string) {
    const booking = this.store.getBooking(bookingId);
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
