import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { BookingStatus } from "../common/domain";
import { EventsService } from "../events/events.service";

@UseGuards(DemoAuthGuard)
@Roles("OWNER", "OWNER_STAFF", "ADMIN")
@Controller("owner")
export class OwnerController {
  constructor(
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService,
    @Inject(EventsService) private readonly events: EventsService
  ) {}

  @Get("homestays")
  @Roles("OWNER", "ADMIN")
  async homestays(@Req() req: Request) {
    return this.store.visibleHomestays(req.user!);
  }

  @Post("homestays")
  @Roles("OWNER", "ADMIN")
  async createHomestay(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.store.createHomestay(req.user!, body);
  }

  @Patch("homestays/:id")
  @Roles("OWNER", "ADMIN")
  async updateHomestay(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateHomestay(req.user!, homestayId, body);
  }

  @Get("homestays/:id/rooms")
  @Roles("OWNER", "ADMIN")
  async rooms(@Req() req: Request, @Param("id") homestayId: string) {
    return this.store.rooms(req.user!, homestayId);
  }

  @Post("homestays/:id/rooms")
  @Roles("OWNER", "ADMIN")
  async createRoom(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.createRoom(req.user!, homestayId, body);
  }

  @Patch("homestays/:id/rooms/:roomId")
  @Roles("OWNER", "ADMIN")
  async updateRoom(@Req() req: Request, @Param("id") homestayId: string, @Param("roomId") roomId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateRoom(req.user!, homestayId, roomId, body);
  }

  @Get("homestays/:id/services")
  @Roles("OWNER", "ADMIN")
  async services(@Req() req: Request, @Param("id") homestayId: string) {
    return this.store.services(req.user!, homestayId);
  }

  @Post("homestays/:id/services")
  @Roles("OWNER", "ADMIN")
  async createService(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.createService(req.user!, homestayId, body);
  }

  @Patch("homestays/:id/services/:serviceId")
  @Roles("OWNER", "ADMIN")
  async updateService(@Req() req: Request, @Param("id") homestayId: string, @Param("serviceId") serviceId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateService(req.user!, homestayId, serviceId, body);
  }

  @Get("bookings")
  async bookings(@Req() req: Request) {
    return this.store.visibleBookings(req.user!);
  }

  @Patch("bookings/:id/status")
  @Roles("OWNER_STAFF", "ADMIN")
  async updateStatus(@Req() req: Request, @Param("id") bookingId: string, @Body() body: { status: BookingStatus }) {
    await this.store.assertCanAccessBooking(req.user!, bookingId);
    const booking = await this.store.updateBookingStatus(bookingId, body.status, req.user!.id);
    await this.events.publish("booking.status_changed", { bookingId, status: booking.status });
    return booking;
  }

  @Post("proxy-bookings")
  @Roles("OWNER_STAFF", "ADMIN")
  async proxyBooking(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const booking = await this.store.createBooking({
      ...body,
      customerId: String(body.customerId ?? "u-customer"),
      proxyCreatedBy: req.user!.id
    });
    await this.events.publish("booking.created", { bookingId: booking.id, status: booking.status, proxyCreatedBy: booking.proxyCreatedBy });
    return booking;
  }

  @Post("bookings/:id/services")
  @Roles("OWNER_STAFF", "ADMIN")
  async addService(@Req() req: Request, @Param("id") bookingId: string, @Body() body: { serviceId: string; quantity?: number }) {
    await this.store.assertCanAccessBooking(req.user!, bookingId);
    const booking = await this.store.addServiceToBooking(bookingId, body.serviceId, Number(body.quantity ?? 1), req.user!.id);
    await this.events.publish("service_order.created", { bookingId, serviceId: body.serviceId });
    return booking;
  }
}
