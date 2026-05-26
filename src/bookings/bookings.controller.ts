import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { BookingStatus } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";
import { EventsService } from "../events/events.service";

@UseGuards(DemoAuthGuard)
@Controller()
export class BookingsController {
  constructor(
    private readonly store: DemoStoreService,
    private readonly events: EventsService
  ) {}

  @Post("bookings")
  @Roles("CUSTOMER", "OWNER_STAFF")
  async create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = req.user!;
    const booking = this.store.createBooking({
      ...body,
      customerId: String(body.customerId ?? user.id),
      proxyCreatedBy: user.role === "OWNER_STAFF" ? user.id : undefined
    });
    await this.events.publish("booking.created", { bookingId: booking.id, status: booking.status });
    return booking;
  }

  @Get("me/bookings")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN")
  listMine(@Req() req: Request) {
    const user = req.user!;
    if (user.role === "CUSTOMER") {
      return this.store.bookings.filter((booking) => booking.customerId === user.id || user.id === "u-customer");
    }
    return this.store.bookings;
  }

  @Get("bookings/:id")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN", "STAFF")
  detail(@Param("id") bookingId: string) {
    return this.store.getBooking(bookingId);
  }

  @Post("bookings/:id/services")
  @Roles("CUSTOMER", "OWNER_STAFF")
  async addService(@Param("id") bookingId: string, @Body() body: { serviceId: string; quantity?: number }) {
    const booking = this.store.addServiceToBooking(bookingId, body.serviceId, Number(body.quantity ?? 1));
    await this.events.publish("service_order.created", { bookingId, serviceId: body.serviceId });
    return booking;
  }

  @Patch("bookings/:id/services/:serviceOrderId/status")
  @Roles("OWNER_STAFF", "ADMIN")
  async updateServiceStatus(@Param("id") bookingId: string, @Param("serviceOrderId") serviceOrderId: string, @Body() body: { status: "PREPARING" | "SERVED" }) {
    const serviceOrder = this.store.setServiceOrderStatus(bookingId, serviceOrderId, body.status);
    await this.events.publish("service_order.updated", { bookingId, serviceOrderId, status: serviceOrder.status });
    return serviceOrder;
  }

  @Patch("bookings/:id/status")
  @Roles("OWNER_STAFF", "ADMIN")
  async updateStatus(@Param("id") bookingId: string, @Body() body: { status: BookingStatus }) {
    const booking = this.store.updateBookingStatus(bookingId, body.status);
    await this.events.publish("booking.status_changed", { bookingId, status: booking.status });
    return booking;
  }
}
