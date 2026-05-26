import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { BookingStatus } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";
import { EventsService } from "../events/events.service";

@UseGuards(DemoAuthGuard)
@Roles("OWNER", "OWNER_STAFF", "ADMIN")
@Controller("owner")
export class OwnerController {
  constructor(
    @Inject(DemoStoreService) private readonly store: DemoStoreService,
    @Inject(EventsService) private readonly events: EventsService
  ) {}

  @Get("homestays")
  @Roles("OWNER", "ADMIN")
  homestays(@Req() req: Request) {
    return this.store.visibleHomestays(req.user!);
  }

  @Post("homestays")
  @Roles("OWNER", "ADMIN")
  createHomestay(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const homestay = {
      ...this.store.homestays[0],
      id: `hs-${Date.now()}`,
      ownerId: req.user!.role === "OWNER" ? req.user!.id : String(body.ownerId ?? "u-owner"),
      name: String(body.name ?? "Homestay moi"),
      type: "Phong" as const,
      location: String(body.location ?? "Tay Ninh"),
      description: String(body.description ?? "Mo ta dang cap nhat"),
      priceFrom: Number(body.priceFrom ?? 500000),
      capacity: Number(body.capacity ?? 2),
      rating: 0,
      imageUrl: String(body.imageUrl ?? "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"),
      amenities: [],
      rooms: [],
      services: [],
      includedServices: [],
      reviews: []
    };
    this.store.homestays.unshift(homestay);
    return homestay;
  }

  @Patch("homestays/:id")
  @Roles("OWNER", "ADMIN")
  updateHomestay(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.updateHomestay(homestayId, body);
  }

  @Get("homestays/:id/rooms")
  @Roles("OWNER", "ADMIN")
  rooms(@Req() req: Request, @Param("id") homestayId: string) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.getHomestay(homestayId).rooms;
  }

  @Post("homestays/:id/rooms")
  @Roles("OWNER", "ADMIN")
  createRoom(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.createRoom(homestayId, body);
  }

  @Patch("homestays/:id/rooms/:roomId")
  @Roles("OWNER", "ADMIN")
  updateRoom(@Req() req: Request, @Param("id") homestayId: string, @Param("roomId") roomId: string, @Body() body: Record<string, unknown>) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.updateRoom(homestayId, roomId, body);
  }

  @Get("homestays/:id/services")
  @Roles("OWNER", "ADMIN")
  services(@Req() req: Request, @Param("id") homestayId: string) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    const homestay = this.store.getHomestay(homestayId);
    return [...homestay.includedServices, ...homestay.services];
  }

  @Post("homestays/:id/services")
  @Roles("OWNER", "ADMIN")
  createService(@Req() req: Request, @Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.createService(homestayId, body);
  }

  @Patch("homestays/:id/services/:serviceId")
  @Roles("OWNER", "ADMIN")
  updateService(@Req() req: Request, @Param("id") homestayId: string, @Param("serviceId") serviceId: string, @Body() body: Record<string, unknown>) {
    this.store.assertCanManageHomestay(req.user!, homestayId);
    return this.store.updateService(homestayId, serviceId, body);
  }

  @Get("bookings")
  bookings(@Req() req: Request) {
    return this.store.visibleBookings(req.user!);
  }

  @Patch("bookings/:id/status")
  @Roles("OWNER_STAFF", "ADMIN")
  async updateStatus(@Req() req: Request, @Param("id") bookingId: string, @Body() body: { status: BookingStatus }) {
    this.store.assertCanAccessBooking(req.user!, bookingId);
    const booking = this.store.updateBookingStatus(bookingId, body.status);
    await this.events.publish("booking.status_changed", { bookingId, status: booking.status });
    return booking;
  }

  @Post("proxy-bookings")
  @Roles("OWNER_STAFF", "ADMIN")
  async proxyBooking(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const booking = this.store.createBooking({
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
    this.store.assertCanAccessBooking(req.user!, bookingId);
    const booking = this.store.addServiceToBooking(bookingId, body.serviceId, Number(body.quantity ?? 1));
    await this.events.publish("service_order.created", { bookingId, serviceId: body.serviceId });
    return booking;
  }
}
