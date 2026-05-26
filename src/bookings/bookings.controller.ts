import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { SupabaseAuthGuard } from "../common/auth.guard";
import { BookingStatus } from "../common/domain";
import { BusinessStoreService } from "../common/business-store.service";
import { EventsService } from "../events/events.service";

@UseGuards(SupabaseAuthGuard)
@Controller()
export class BookingsController {
  constructor(
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService,
    @Inject(EventsService) private readonly events: EventsService
  ) {}

  @Post("bookings")
  @Roles("CUSTOMER", "OWNER_STAFF", "ADMIN")
  async create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = req.user!;
    if (user.role === "OWNER_STAFF") {
      await this.store.assertCanOperateHomestay(user, String(body.homestayId ?? ""));
    }
    const customerId = user.role === "CUSTOMER" ? user.id : await this.store.resolveBookingCustomer(body);
    const booking = await this.store.createBooking({
      ...body,
      customerId,
      proxyCreatedBy: user.role === "OWNER_STAFF" ? user.id : undefined
    });
    await this.events.publish("booking.created", { bookingId: booking.id, status: booking.status });
    return booking;
  }

  @Get("me/bookings")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN")
  async listMine(@Req() req: Request) {
    return this.store.visibleBookings(req.user!);
  }

  @Get("bookings/:id")
  @Roles("CUSTOMER", "OWNER_STAFF", "OWNER", "ADMIN")
  async detail(@Req() req: Request, @Param("id") bookingId: string) {
    return this.store.assertCanAccessBooking(req.user!, bookingId);
  }

  @Post("bookings/:id/services")
  @Roles("OWNER_STAFF", "ADMIN")
  async addService(@Req() req: Request, @Param("id") bookingId: string, @Body() body: { serviceId: string; quantity?: number }) {
    await this.store.assertCanAccessBooking(req.user!, bookingId);
    const booking = await this.store.addServiceToBooking(bookingId, body.serviceId, Number(body.quantity ?? 1), req.user!.id);
    await this.events.publish("service_order.created", { bookingId, serviceId: body.serviceId });
    return booking;
  }

  @Patch("bookings/:id/services/:serviceOrderId/status")
  @Roles("OWNER_STAFF", "ADMIN")
  async updateServiceStatus(@Req() req: Request, @Param("id") bookingId: string, @Param("serviceOrderId") serviceOrderId: string, @Body() body: { status: "PREPARING" | "SERVED" }) {
    await this.store.assertCanAccessBooking(req.user!, bookingId);
    const serviceOrder = await this.store.setServiceOrderStatus(bookingId, serviceOrderId, body.status);
    await this.events.publish("service_order.updated", { bookingId, serviceOrderId, status: serviceOrder.status });
    return serviceOrder;
  }

  @Patch("bookings/:id/status")
  @Roles("CUSTOMER", "OWNER_STAFF", "ADMIN")
  async updateStatus(@Req() req: Request, @Param("id") bookingId: string, @Body() body: { status: BookingStatus }) {
    await this.store.assertCanAccessBooking(req.user!, bookingId);
    if (req.user!.role === "CUSTOMER" && body.status !== "CANCELLED") {
      throw new ForbiddenException("Customer can only cancel their own booking");
    }
    const booking = await this.store.updateBookingStatus(bookingId, body.status, req.user!.id, req.user!.role);
    await this.events.publish("booking.status_changed", { bookingId, status: booking.status });
    return booking;
  }
}
