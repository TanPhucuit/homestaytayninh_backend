import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { Article, Booking, BookingService, BookingStatus, DemoUser, Homestay, Payment, Service, UserRole, ViolationReport } from "./domain";
import { DemoStoreService } from "./demo-store.service";

type BookingInput = Partial<Booking> & { serviceItems?: Array<{ serviceId: string; quantity: number }> };

@Injectable()
export class BusinessStoreService implements OnModuleDestroy {
  private readonly prisma?: PrismaClient;

  constructor(
    @Inject(DemoStoreService) private readonly demo: DemoStoreService,
    @Inject(ConfigService) config: ConfigService
  ) {
    const databaseUrl = config.get<string>("DATABASE_URL");
    if (databaseUrl?.startsWith("postgres") && process.env.NODE_ENV !== "test") {
      this.prisma = new PrismaClient();
    }
  }

  get persistent() {
    return Boolean(this.prisma);
  }

  async onModuleDestroy() {
    await this.prisma?.$disconnect();
  }

  async findUser(email?: string, role?: UserRole) {
    if (!this.prisma) {
      return (
        (email ? this.demo.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) : undefined) ??
        this.demo.users.find((user) => user.role === role) ??
        this.demo.users[0]
      );
    }
    const user =
      (email ? await this.prisma.userProfile.findUnique({ where: { email } }) : null) ??
      (role ? await this.prisma.userProfile.findFirst({ where: { role } }) : null) ??
      (await this.prisma.userProfile.findFirst());
    if (!user) throw new NotFoundException("User not found");
    return this.mapUser(user);
  }

  async findAuthenticatedUser(authId: string, email?: string) {
    if (!this.prisma) throw new ForbiddenException("Supabase authentication requires database persistence");
    const user = await this.prisma.userProfile.findFirst({
      where: { OR: [{ authId }, ...(email ? [{ email }] : [])] }
    });
    if (!user) {
      if (!email) throw new ForbiddenException("Authenticated user has no email profile");
      return this.mapUser(
        await this.prisma.userProfile.create({
          data: { id: this.id("u"), authId, email, name: email.split("@")[0], role: "CUSTOMER" }
        })
      );
    }
    if (user.banned) throw new ForbiddenException("Authenticated user has no active profile");
    if (!user.authId) {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: user.id }, data: { authId } }));
    }
    return this.mapUser(user);
  }

  async visibleHomestays(user: DemoUser): Promise<Homestay[]> {
    if (!this.prisma) return this.demo.visibleHomestays(user);
    const where =
      user.role === "ADMIN"
        ? {}
        : user.role === "OWNER"
          ? { ownerId: user.id }
          : user.role === "OWNER_STAFF"
            ? { staffAssignments: { some: { staffId: user.id } } }
            : { id: "__none__" };
    const rows = await this.prisma.homestay.findMany({ where, include: this.homestayInclude() });
    return rows.map((row) => this.mapHomestay(row));
  }

  async getHomestay(homestayId: string): Promise<Homestay> {
    if (!this.prisma) return this.demo.getHomestay(homestayId);
    const row = await this.prisma.homestay.findUnique({ where: { id: homestayId }, include: this.homestayInclude() });
    if (!row) throw new NotFoundException("Homestay not found");
    return this.mapHomestay(row);
  }

  async assertCanManageHomestay(user: DemoUser, homestayId: string) {
    const homestay = await this.getHomestay(homestayId);
    if (user.role !== "ADMIN" && (user.role !== "OWNER" || homestay.ownerId !== user.id)) {
      throw new ForbiddenException("User cannot manage this homestay");
    }
    return homestay;
  }

  async createHomestay(user: DemoUser, body: Record<string, unknown>) {
    if (!this.prisma) {
      const homestay: Homestay = {
        ...this.demo.homestays[0],
        id: this.id("hs"),
        ownerId: user.role === "OWNER" ? user.id : String(body.ownerId ?? "u-owner"),
        name: String(body.name ?? "Homestay mới"),
        type: "Phòng",
        location: String(body.location ?? "Tây Ninh"),
        description: String(body.description ?? "Mô tả đang cập nhật"),
        priceFrom: Number(body.priceFrom ?? 500000),
        capacity: Number(body.capacity ?? 2),
        rating: 0,
        imageUrl: String(body.imageUrl ?? this.demo.homestays[0].imageUrl),
        amenities: [],
        rooms: [],
        services: [],
        includedServices: [],
        reviews: []
      };
      this.demo.homestays.unshift(homestay);
      return homestay;
    }
    const ownerId = user.role === "OWNER" ? user.id : String(body.ownerId ?? "u-owner");
    this.positive(Number(body.priceFrom ?? 500000), "priceFrom", true);
    this.positive(Number(body.capacity ?? 2), "capacity");
    const row = await this.prisma.homestay.create({
      data: {
        id: this.id("hs"),
        ownerId,
        name: String(body.name ?? "Homestay mới"),
        type: String(body.type ?? "Phòng"),
        location: String(body.location ?? "Tây Ninh"),
        description: String(body.description ?? "Mô tả đang cập nhật"),
        priceFrom: Number(body.priceFrom ?? 500000),
        capacity: Number(body.capacity ?? 2),
        imageUrl: String(body.imageUrl ?? "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80")
      },
      include: this.homestayInclude()
    });
    return this.mapHomestay(row);
  }

  async updateHomestay(user: DemoUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.updateHomestay(homestayId, body);
    const data: Record<string, unknown> = {};
    for (const field of ["name", "type", "location", "description", "imageUrl"] as const) {
      if (body[field] !== undefined) data[field] = String(body[field]);
    }
    if (body.priceFrom !== undefined) {
      this.positive(Number(body.priceFrom), "priceFrom", true);
      data.priceFrom = Number(body.priceFrom);
    }
    if (body.capacity !== undefined) {
      this.positive(Number(body.capacity), "capacity");
      data.capacity = Number(body.capacity);
    }
    const row = await this.prisma.homestay.update({ where: { id: homestayId }, data, include: this.homestayInclude() });
    return this.mapHomestay(row);
  }

  async deleteHomestay(user: DemoUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) {
      const index = this.demo.homestays.findIndex((homestay) => homestay.id === homestayId);
      if (index === -1) throw new NotFoundException("Homestay not found");
      const [homestay] = this.demo.homestays.splice(index, 1);
      return homestay;
    }
    try {
      return this.mapHomestay(await this.prisma.homestay.delete({ where: { id: homestayId }, include: this.homestayInclude() }));
    } catch {
      throw new NotFoundException("Homestay not found");
    }
  }

  async images(user: DemoUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return [{ id: "img-demo-1", homestayId, url: homestay.imageUrl, alt: homestay.name, position: 0 }];
    return this.prisma.homestayImage.findMany({ where: { homestayId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  }

  async createImage(user: DemoUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const url = String(body.url ?? "").trim();
    if (!url) throw new BadRequestException("Image URL is required");
    const position = Number(body.position ?? 0);
    this.positive(position, "position", true);
    if (!this.prisma) {
      const homestay = this.demo.getHomestay(homestayId);
      if (position === 0) homestay.imageUrl = url;
      return { id: this.id("img"), homestayId, url, alt: String(body.alt ?? ""), position };
    }
    const image = await this.prisma.homestayImage.create({
      data: { id: randomUUID(), homestayId, url, alt: String(body.alt ?? ""), position }
    });
    if (position === 0) await this.prisma.homestay.update({ where: { id: homestayId }, data: { imageUrl: url } });
    return image;
  }

  async updateImage(user: DemoUser, homestayId: string, imageId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return { id: imageId, homestayId, url: String(body.url ?? ""), alt: String(body.alt ?? ""), position: Number(body.position ?? 0) };
    const existing = await this.prisma.homestayImage.findFirst({ where: { id: imageId, homestayId } });
    if (!existing) throw new NotFoundException("Image not found");
    const data: Record<string, unknown> = {};
    if (body.url !== undefined) data.url = String(body.url);
    if (body.alt !== undefined) data.alt = String(body.alt);
    if (body.position !== undefined) {
      this.positive(Number(body.position), "position", true);
      data.position = Number(body.position);
    }
    const image = await this.prisma.homestayImage.update({ where: { id: imageId }, data });
    if (image.position === 0) await this.prisma.homestay.update({ where: { id: homestayId }, data: { imageUrl: image.url } });
    return image;
  }

  async deleteImage(user: DemoUser, homestayId: string, imageId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return { id: imageId, homestayId, deleted: true };
    const existing = await this.prisma.homestayImage.findFirst({ where: { id: imageId, homestayId } });
    if (!existing) throw new NotFoundException("Image not found");
    return this.prisma.homestayImage.delete({ where: { id: imageId } });
  }

  async rooms(user: DemoUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    return homestay.rooms;
  }

  async createRoom(user: DemoUser, homestayId: string, body: Record<string, unknown>) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.createRoom(homestayId, body);
    const pricePerNight = Number(body.pricePerNight ?? homestay.priceFrom);
    const capacity = Number(body.capacity ?? 2);
    const totalUnits = Number(body.totalUnits ?? 1);
    this.positive(pricePerNight, "pricePerNight", true);
    this.positive(capacity, "capacity");
    this.positive(totalUnits, "totalUnits");
    return this.prisma.room.create({
      data: {
        id: this.id("room"),
        homestayId,
        name: String(body.name ?? "Phòng mới"),
        roomType: String(body.roomType ?? homestay.type),
        pricePerNight,
        capacity,
        totalUnits,
        active: body.active === undefined ? true : Boolean(body.active)
      }
    });
  }

  async updateRoom(user: DemoUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.updateRoom(homestayId, roomId, body);
    const existing = await this.prisma.room.findFirst({ where: { id: roomId, homestayId } });
    if (!existing) throw new NotFoundException("Room not found");
    const data: Record<string, unknown> = {};
    for (const field of ["name", "roomType"] as const) {
      if (body[field] !== undefined) data[field] = String(body[field]);
    }
    for (const field of ["pricePerNight", "capacity", "totalUnits"] as const) {
      if (body[field] !== undefined) {
        this.positive(Number(body[field]), field, field === "pricePerNight");
        data[field] = Number(body[field]);
      }
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    return this.prisma.room.update({ where: { id: roomId }, data });
  }

  async deleteRoom(user: DemoUser, homestayId: string, roomId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.updateRoom(homestayId, roomId, { active: false });
    const existing = await this.prisma.room.findFirst({ where: { id: roomId, homestayId } });
    if (!existing) throw new NotFoundException("Room not found");
    return this.prisma.room.update({ where: { id: roomId }, data: { active: false } });
  }

  async roomRates(user: DemoUser, homestayId: string, roomId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    if (!this.prisma) return [];
    return this.prisma.roomRate.findMany({ where: { roomId }, orderBy: { startDate: "asc" } });
  }

  async createRoomRate(user: DemoUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const pricePerNight = Number(body.pricePerNight);
    this.positive(pricePerNight, "pricePerNight", true);
    const { startDate, endDate } = this.dateRange(String(body.startDate), String(body.endDate));
    if (!this.prisma) return { id: this.id("rate"), roomId, startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10), pricePerNight };
    return this.prisma.roomRate.create({
      data: { id: randomUUID(), roomId, startDate, endDate, pricePerNight }
    });
  }

  async updateRoomRate(user: DemoUser, homestayId: string, roomId: string, rateId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    if (!this.prisma) return { id: rateId, roomId, ...body };
    const existing = await this.prisma.roomRate.findFirst({ where: { id: rateId, roomId } });
    if (!existing) throw new NotFoundException("Room rate not found");
    const data: Record<string, unknown> = {};
    if (body.pricePerNight !== undefined) {
      this.positive(Number(body.pricePerNight), "pricePerNight", true);
      data.pricePerNight = Number(body.pricePerNight);
    }
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const { startDate, endDate } = this.dateRange(String(body.startDate ?? existing.startDate), String(body.endDate ?? existing.endDate));
      data.startDate = startDate;
      data.endDate = endDate;
    }
    return this.prisma.roomRate.update({ where: { id: rateId }, data });
  }

  async deleteRoomRate(user: DemoUser, homestayId: string, roomId: string, rateId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    if (!this.prisma) return { id: rateId, roomId, deleted: true };
    const existing = await this.prisma.roomRate.findFirst({ where: { id: rateId, roomId } });
    if (!existing) throw new NotFoundException("Room rate not found");
    return this.prisma.roomRate.delete({ where: { id: rateId } });
  }

  async services(user: DemoUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    return [...homestay.includedServices, ...homestay.services];
  }

  async createService(user: DemoUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.createService(homestayId, body);
    const unitPrice = Number(body.unitPrice ?? 0);
    this.positive(unitPrice, "unitPrice", true);
    return this.prisma.service.create({
      data: {
        id: this.id("svc"),
        homestayId,
        name: String(body.name ?? "Dịch vụ mới"),
        description: body.description === undefined ? null : String(body.description),
        unitPrice,
        included: Boolean(body.included ?? false),
        active: body.active === undefined ? true : Boolean(body.active)
      }
    });
  }

  async updateService(user: DemoUser, homestayId: string, serviceId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.updateService(homestayId, serviceId, body);
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, homestayId } });
    if (!service) throw new NotFoundException("Service not found");
    const data: Record<string, unknown> = {};
    for (const field of ["name", "description"] as const) {
      if (body[field] !== undefined) data[field] = String(body[field]);
    }
    if (body.unitPrice !== undefined) {
      this.positive(Number(body.unitPrice), "unitPrice", true);
      data.unitPrice = Number(body.unitPrice);
    }
    if (body.included !== undefined) data.included = Boolean(body.included);
    if (body.active !== undefined) data.active = Boolean(body.active);
    return this.prisma.service.update({ where: { id: serviceId }, data });
  }

  async deleteService(user: DemoUser, homestayId: string, serviceId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    if (!this.prisma) return this.demo.updateService(homestayId, serviceId, { active: false });
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, homestayId } });
    if (!service) throw new NotFoundException("Service not found");
    return this.prisma.service.update({ where: { id: serviceId }, data: { active: false } });
  }

  async visibleBookings(user: DemoUser): Promise<Booking[]> {
    if (!this.prisma) return this.demo.visibleBookings(user);
    const where =
      user.role === "ADMIN"
        ? {}
        : user.role === "CUSTOMER"
          ? { customerId: user.id }
          : user.role === "OWNER"
            ? { homestay: { ownerId: user.id } }
            : user.role === "OWNER_STAFF"
              ? { homestay: { staffAssignments: { some: { staffId: user.id } } } }
              : { id: "__none__" };
    const rows = await this.prisma.booking.findMany({ where, include: { services: true, payment: true }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => this.mapBooking(row));
  }

  async assertCanAccessBooking(user: DemoUser, bookingId: string): Promise<Booking> {
    if (!this.prisma) return this.demo.assertCanAccessBooking(user, bookingId);
    const row = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { services: true, payment: true, homestay: { include: { staffAssignments: true } } }
    });
    if (!row) throw new NotFoundException("Booking not found");
    const allowed =
      user.role === "ADMIN" ||
      (user.role === "CUSTOMER" && row.customerId === user.id) ||
      (user.role === "OWNER" && row.homestay.ownerId === user.id) ||
      (user.role === "OWNER_STAFF" && row.homestay.staffAssignments.some((assignment) => assignment.staffId === user.id));
    if (!allowed) throw new ForbiddenException("User cannot access this booking");
    return this.mapBooking(row);
  }

  async createBooking(input: BookingInput): Promise<Booking> {
    if (!this.prisma) return this.demo.createBooking(input);
    if (!input.homestayId) throw new BadRequestException("Homestay is required");
    const homestay = await this.prisma.homestay.findUnique({
      where: { id: String(input.homestayId) },
      include: { rooms: true, services: true }
    });
    if (!homestay) throw new NotFoundException("Homestay not found");
    const room = homestay.rooms.find((item) => item.id === input.roomId) ?? homestay.rooms[0];
    if (!room?.active) throw new BadRequestException("No active room is available");
    const guestCount = Number(input.guestCount ?? 1);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > room.capacity) {
      throw new BadRequestException("Guest count exceeds room capacity");
    }
    const nights = this.nights(String(input.checkIn), String(input.checkOut));
    const items = input.serviceItems ?? [];
    const addOns = items.map((item) => {
      const service = homestay.services.find((candidate) => candidate.id === item.serviceId && !candidate.included && candidate.active);
      if (!service) throw new NotFoundException(`Service ${item.serviceId} not found`);
      this.positive(item.quantity, "quantity");
      return { service, quantity: item.quantity, total: service.unitPrice * item.quantity };
    });
    const roomTotal = room.pricePerNight * nights;
    const serviceTotal = addOns.reduce((total, item) => total + item.total, 0);
    const bookingId = this.id("bk");
    const checkIn = new Date(String(input.checkIn));
    const checkOut = new Date(String(input.checkOut));
    const row = await this.prisma.$transaction(
      async (tx) => {
        const reserved = await tx.booking.count({
          where: {
            roomId: room.id,
            status: { in: ["PENDING", "CONFIRMED", "IN_STAY"] },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn }
          }
        });
        if (reserved >= room.totalUnits) {
          throw new BadRequestException("Room is no longer available for the selected dates");
        }
        return tx.booking.create({
          data: {
            id: bookingId,
            customerId: String(input.customerId ?? "u-customer"),
            homestayId: homestay.id,
            roomId: room.id,
            guestName: String(input.guestName ?? "Khách hàng"),
            guestPhone: String(input.guestPhone ?? "0900000000"),
            guestCount,
            checkIn,
            checkOut,
            roomTotal,
            serviceTotal,
            taxTotal: 0,
            grandTotal: roomTotal + serviceTotal,
            proxyCreatedBy: input.proxyCreatedBy,
            services: {
              create: addOns.map(({ service, quantity, total }) => ({
                id: this.id("bs"),
                serviceId: service.id,
                name: service.name,
                quantity,
                unitPrice: service.unitPrice,
                total
              }))
            }
          },
          include: { services: true, payment: true }
        }).then(async (booking) => {
          await tx.auditLog.create({
            data: { actorId: input.proxyCreatedBy ?? String(input.customerId ?? "u-customer"), action: "BOOKING_CREATED", entity: "Booking", entityId: booking.id }
          });
          return booking;
        });
      },
      { isolationLevel: "Serializable" }
    );
    return this.mapBooking(row);
  }

  async addServiceToBooking(bookingId: string, serviceId: string, quantity = 1, actorId?: string): Promise<Booking> {
    if (!this.prisma) return this.demo.addServiceToBooking(bookingId, serviceId, quantity);
    this.positive(quantity, "quantity");
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new NotFoundException("Booking not found");
      if (booking.status !== "IN_STAY") {
        throw new BadRequestException("Add-on service is only available while booking is IN_STAY");
      }
      const service = await tx.service.findFirst({ where: { id: serviceId, homestayId: booking.homestayId, included: false, active: true } });
      if (!service) throw new NotFoundException("Service not found");
      const total = service.unitPrice * quantity;
      await tx.bookingService.create({
        data: { id: this.id("bs"), bookingId, serviceId, name: service.name, quantity, unitPrice: service.unitPrice, total }
      });
      await tx.payment.updateMany({ where: { bookingId }, data: { amount: { increment: total } } });
      await tx.auditLog.create({
        data: { actorId, action: "SERVICE_ORDER_CREATED", entity: "Booking", entityId: bookingId, metadata: { serviceId, quantity, total } }
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: { serviceTotal: { increment: total }, grandTotal: { increment: total } },
        include: { services: true, payment: true }
      });
    });
    return this.mapBooking(result);
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus, actorId?: string): Promise<Booking> {
    if (!this.prisma) return this.demo.updateBookingStatus(bookingId, status);
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException("Booking not found");
    const allowed: Record<BookingStatus, BookingStatus[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["IN_STAY", "CANCELLED"],
      IN_STAY: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: []
    };
    if (!Object.hasOwn(allowed, status) || !allowed[booking.status].includes(status)) {
      throw new BadRequestException(`Cannot change booking from ${booking.status} to ${status}`);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status }, include: { services: true, payment: true } });
      await tx.auditLog.create({
        data: { actorId, action: "BOOKING_STATUS_CHANGED", entity: "Booking", entityId: bookingId, metadata: { from: booking.status, to: status } }
      });
      return updated;
    });
    return this.mapBooking(row);
  }

  async upsertPayment(bookingId: string, payment: Omit<Payment, "id" | "bookingId">, actorId?: string) {
    if (!this.prisma) return this.demo.upsertPayment(bookingId, payment);
    const statuses: Payment["status"][] = ["INITIATED", "PENDING", "PAID", "FAILED", "CANCELLED"];
    if (!statuses.includes(payment.status)) throw new BadRequestException("Invalid payment status");
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.upsert({
        where: { bookingId },
        update: payment,
        create: { id: this.id("pay"), bookingId, ...payment }
      });
      await tx.auditLog.create({
        data: { actorId, action: "PAYMENT_UPDATED", entity: "Payment", entityId: updated.id, metadata: { bookingId, status: payment.status } }
      });
      return updated;
    });
    return this.mapPayment(row);
  }

  async setServiceOrderStatus(bookingId: string, serviceOrderId: string, status: BookingService["status"]) {
    if (!this.prisma) return this.demo.setServiceOrderStatus(bookingId, serviceOrderId, status);
    if (status !== "PREPARING" && status !== "SERVED") throw new BadRequestException("Invalid service order status");
    const existing = await this.prisma.bookingService.findFirst({ where: { id: serviceOrderId, bookingId } });
    if (!existing) throw new NotFoundException("Booking service not found");
    return this.prisma.bookingService.update({ where: { id: serviceOrderId }, data: { status } });
  }

  async metrics() {
    if (!this.prisma) return this.demo.metrics();
    const [bookings, homestays] = await Promise.all([
      this.prisma.booking.findMany({ include: { payment: true } }),
      this.prisma.homestay.findMany({ include: { _count: { select: { bookings: true } } } })
    ]);
    return {
      transactions: bookings.length,
      revenue: bookings.reduce((sum, item) => sum + (item.payment?.status === "PAID" ? item.grandTotal : 0), 0),
      occupancyRate: bookings.length ? Math.round((bookings.filter((item) => item.status === "IN_STAY").length / bookings.length) * 100) : 0,
      completed: bookings.filter((item) => item.status === "COMPLETED").length,
      homestayPerformance: homestays.map((homestay) => ({ homestayId: homestay.id, name: homestay.name, bookings: homestay._count.bookings }))
    };
  }

  async users() {
    if (!this.prisma) return this.demo.users;
    return (await this.prisma.userProfile.findMany({ orderBy: { createdAt: "desc" } })).map((user) => this.mapUser(user));
  }

  async createUser(input: { name?: string; email?: string; phone?: string; role?: UserRole }) {
    if (!this.prisma) return this.demo.createUser(input);
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Email is required");
    const role = this.validRole(input.role ?? "CUSTOMER");
    try {
      const user = await this.prisma.userProfile.create({
        data: { id: this.id("u"), name: String(input.name ?? email.split("@")[0]), email, phone: input.phone, role }
      });
      return this.mapUser(user);
    } catch {
      throw new BadRequestException("Email already exists");
    }
  }

  async banUser(userId: string, banned = true) {
    if (!this.prisma) return this.demo.banUser(userId, banned);
    try {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: userId }, data: { banned } }));
    } catch {
      throw new NotFoundException("User not found");
    }
  }

  async setRole(userId: string, role: UserRole) {
    if (!this.prisma) return this.demo.setRole(userId, role);
    this.validRole(role);
    try {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: userId }, data: { role } }));
    } catch {
      throw new NotFoundException("User not found");
    }
  }

  async articles(): Promise<Article[]> {
    if (!this.prisma) return this.demo.articles;
    return (await this.prisma.article.findMany({ orderBy: { createdAt: "desc" } })).map((article) => ({ ...article }));
  }

  async createArticle(input: Partial<Article>) {
    if (!this.prisma) return this.demo.createArticle(input);
    const status = this.validArticleStatus(input.status ?? "DRAFT");
    return this.prisma.article.create({
      data: {
        id: this.id("art"),
        authorId: input.authorId ?? "u-staff",
        title: String(input.title ?? "Bài viết mới"),
        slug: String(input.slug ?? this.id("article")),
        excerpt: String(input.excerpt ?? ""),
        content: String(input.content ?? ""),
        status
      }
    });
  }

  async updateArticle(articleId: string, input: Partial<Article>) {
    if (!this.prisma) return this.demo.updateArticle(articleId, input);
    const status = input.status ? this.validArticleStatus(input.status) : undefined;
    try {
      return await this.prisma.article.update({ where: { id: articleId }, data: { ...input, status } });
    } catch {
      throw new NotFoundException("Article not found");
    }
  }

  async deleteArticle(articleId: string) {
    if (!this.prisma) return this.demo.deleteArticle(articleId);
    try {
      return await this.prisma.article.delete({ where: { id: articleId } });
    } catch {
      throw new NotFoundException("Article not found");
    }
  }

  async setArticleStatus(articleId: string, status: Article["status"]) {
    return this.updateArticle(articleId, { status });
  }

  async reports(): Promise<ViolationReport[]> {
    if (!this.prisma) return this.demo.reports;
    return (await this.prisma.violationReport.findMany({ orderBy: { createdAt: "desc" } })).map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString()
    }));
  }

  async resolveReport(reportId: string) {
    if (!this.prisma) return this.demo.resolveReport(reportId);
    try {
      const report = await this.prisma.violationReport.update({ where: { id: reportId }, data: { status: "RESOLVED" } });
      return { ...report, createdAt: report.createdAt.toISOString() };
    } catch {
      throw new NotFoundException("Violation report not found");
    }
  }

  private homestayInclude() {
    return { rooms: true, amenities: true, services: true, reviews: true, images: true } as const;
  }

  private mapHomestay(row: any): Homestay {
    return {
      ...row,
      amenities: row.amenities.map((amenity: { name: string }) => amenity.name),
      includedServices: row.services.filter((service: Service) => service.included),
      services: row.services.filter((service: Service) => !service.included),
      reviews: row.reviews,
      images: row.images ?? []
    };
  }

  private mapBooking(row: any): Booking {
    return {
      ...row,
      checkIn: row.checkIn instanceof Date ? row.checkIn.toISOString().slice(0, 10) : row.checkIn,
      checkOut: row.checkOut instanceof Date ? row.checkOut.toISOString().slice(0, 10) : row.checkOut,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      payment: row.payment ? this.mapPayment(row.payment) : undefined
    };
  }

  private mapPayment(row: any): Payment {
    return { ...row, rawPayload: undefined };
  }

  private mapUser(row: any): DemoUser {
    return { id: row.id, name: row.name, email: row.email, phone: row.phone ?? undefined, role: row.role, banned: row.banned };
  }

  private validRole(role: UserRole) {
    const roles: UserRole[] = ["CUSTOMER", "OWNER", "OWNER_STAFF", "STAFF", "ADMIN"];
    if (!roles.includes(role)) throw new BadRequestException("Invalid user role");
    return role;
  }

  private validArticleStatus(status: Article["status"]) {
    if (status !== "DRAFT" && status !== "PUBLISHED") throw new BadRequestException("Invalid article status");
    return status;
  }

  private positive(value: number, name: string, allowZero = false) {
    const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
    if (!valid) throw new BadRequestException(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }

  private async assertRoomBelongsToHomestay(user: DemoUser, homestayId: string, roomId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    const room = homestay.rooms.find((item) => item.id === roomId);
    if (!room) throw new NotFoundException("Room not found");
    return room;
  }

  private dateRange(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
      throw new BadRequestException("End date must be on or after start date");
    }
    return { startDate, endDate };
  }

  private nights(checkIn: string, checkOut: string) {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new BadRequestException("Check-out must be after check-in");
    }
    return Math.ceil((end - start) / 86_400_000);
  }

  private id(prefix: string) {
    return `${prefix}-${randomUUID()}`;
  }
}
