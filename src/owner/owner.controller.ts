import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { BookingStatus } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";

@UseGuards(DemoAuthGuard)
@Roles("OWNER", "OWNER_STAFF", "ADMIN")
@Controller("owner")
export class OwnerController {
  constructor(private readonly store: DemoStoreService) {}

  @Get("homestays")
  homestays() {
    return this.store.homestays;
  }

  @Post("homestays")
  createHomestay(@Body() body: Record<string, unknown>) {
    const homestay = {
      ...this.store.homestays[0],
      id: `hs-${Date.now()}`,
      ownerId: "u-owner",
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
  updateHomestay(@Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateHomestay(homestayId, body);
  }

  @Get("homestays/:id/rooms")
  rooms(@Param("id") homestayId: string) {
    return this.store.getHomestay(homestayId).rooms;
  }

  @Post("homestays/:id/rooms")
  createRoom(@Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.createRoom(homestayId, body);
  }

  @Patch("homestays/:id/rooms/:roomId")
  updateRoom(@Param("id") homestayId: string, @Param("roomId") roomId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateRoom(homestayId, roomId, body);
  }

  @Get("homestays/:id/services")
  services(@Param("id") homestayId: string) {
    const homestay = this.store.getHomestay(homestayId);
    return [...homestay.includedServices, ...homestay.services];
  }

  @Post("homestays/:id/services")
  createService(@Param("id") homestayId: string, @Body() body: Record<string, unknown>) {
    return this.store.createService(homestayId, body);
  }

  @Patch("homestays/:id/services/:serviceId")
  updateService(@Param("id") homestayId: string, @Param("serviceId") serviceId: string, @Body() body: Record<string, unknown>) {
    return this.store.updateService(homestayId, serviceId, body);
  }

  @Get("bookings")
  bookings() {
    return this.store.bookings;
  }

  @Patch("bookings/:id/status")
  updateStatus(@Param("id") bookingId: string, @Body() body: { status: BookingStatus }) {
    return this.store.updateBookingStatus(bookingId, body.status);
  }

  @Post("proxy-bookings")
  proxyBooking(@Body() body: Record<string, unknown>) {
    return this.store.createBooking({
      ...body,
      customerId: String(body.customerId ?? "u-customer"),
      proxyCreatedBy: "u-owner-staff"
    });
  }

  @Post("bookings/:id/services")
  addService(@Param("id") bookingId: string, @Body() body: { serviceId: string; quantity?: number }) {
    return this.store.addServiceToBooking(bookingId, body.serviceId, Number(body.quantity ?? 1));
  }
}
