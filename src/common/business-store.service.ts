import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { Article, AuthenticatedUser, Booking, BookingService, BookingStatus, Homestay, Payment, Service, UserRole, ViolationReport } from "./domain";

type BookingInput = Partial<Booking> & { serviceItems?: Array<{ serviceId: string; quantity: number }> };

@Injectable()
export class BusinessStoreService implements OnModuleDestroy, OnModuleInit {
  private readonly prisma: PrismaClient;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const databaseUrl = config.get<string>("DATABASE_URL");
    if (!databaseUrl?.startsWith("postgres")) throw new Error("DATABASE_URL is required.");
    this.prisma = new PrismaClient();
  }

  get persistent() {
    return true;
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  async onModuleInit() {
    try {
      await this.prisma.$connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`DATABASE_URL connection failed: ${message}`);
    }
  }

  async findAuthenticatedUser(authId: string, email?: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) throw new ForbiddenException("Authenticated user has no email profile");
    const [byAuthId, byEmail] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { authId } }),
      this.prisma.userProfile.findUnique({ where: { email: normalizedEmail } })
    ]);
    if (byAuthId && byEmail && byAuthId.id !== byEmail.id) {
      throw new ForbiddenException("Authenticated account conflicts with an existing email profile");
    }
    const user = byAuthId ?? byEmail;
    if (!user) {
      return this.mapUser(
        await this.prisma.userProfile.create({
          data: { id: this.id("u"), authId, email: normalizedEmail, name: normalizedEmail.split("@")[0], role: "CUSTOMER" }
        })
      );
    }
    if (user.banned) throw new ForbiddenException("Authenticated user has no active profile");
    if (!user.authId) {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: user.id }, data: { authId } }));
    }
    return this.mapUser(user);
  }

  async visibleHomestays(user: AuthenticatedUser): Promise<Homestay[]> {
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
    const row = await this.prisma.homestay.findUnique({ where: { id: homestayId }, include: this.homestayInclude() });
    if (!row) throw new NotFoundException("Homestay not found");
    return this.mapHomestay(row);
  }

  async assertCanManageHomestay(user: AuthenticatedUser, homestayId: string) {
    const homestay = await this.getHomestay(homestayId);
    if (user.role !== "ADMIN" && (user.role !== "OWNER" || homestay.ownerId !== user.id)) {
      throw new ForbiddenException("User cannot manage this homestay");
    }
    return homestay;
  }

  async assertCanOperateHomestay(user: AuthenticatedUser, homestayId: string) {
    if (user.role === "ADMIN") return this.getHomestay(homestayId);
    if (user.role !== "OWNER_STAFF") throw new ForbiddenException("User cannot operate this homestay");
    const assignment = await this.prisma.ownerStaffAssignment.findUnique({
      where: { homestayId_staffId: { homestayId, staffId: user.id } }
    });
    if (!assignment) throw new ForbiddenException("User is not assigned to this homestay");
    return this.getHomestay(homestayId);
  }

  async createHomestay(user: AuthenticatedUser, body: Record<string, unknown>) {
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

  async updateHomestay(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
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

  async deleteHomestay(user: AuthenticatedUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    try {
      return this.mapHomestay(await this.prisma.homestay.delete({ where: { id: homestayId }, include: this.homestayInclude() }));
    } catch {
      throw new NotFoundException("Homestay not found");
    }
  }

  async images(user: AuthenticatedUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    return this.prisma.homestayImage.findMany({ where: { homestayId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  }

  async createImage(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const url = String(body.url ?? "").trim();
    if (!url) throw new BadRequestException("Image URL is required");
    const position = Number(body.position ?? 0);
    this.positive(position, "position", true);
    const image = await this.prisma.homestayImage.create({
      data: { id: randomUUID(), homestayId, url, alt: String(body.alt ?? ""), position }
    });
    if (position === 0) await this.prisma.homestay.update({ where: { id: homestayId }, data: { imageUrl: url } });
    return image;
  }

  async updateImage(user: AuthenticatedUser, homestayId: string, imageId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
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

  async deleteImage(user: AuthenticatedUser, homestayId: string, imageId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const existing = await this.prisma.homestayImage.findFirst({ where: { id: imageId, homestayId } });
    if (!existing) throw new NotFoundException("Image not found");
    return this.prisma.homestayImage.delete({ where: { id: imageId } });
  }

  async rooms(user: AuthenticatedUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    return homestay.rooms;
  }

  async createRoom(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
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

  async updateRoom(user: AuthenticatedUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
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

  async deleteRoom(user: AuthenticatedUser, homestayId: string, roomId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const existing = await this.prisma.room.findFirst({ where: { id: roomId, homestayId } });
    if (!existing) throw new NotFoundException("Room not found");
    return this.prisma.room.update({ where: { id: roomId }, data: { active: false } });
  }

  async roomRates(user: AuthenticatedUser, homestayId: string, roomId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    return this.prisma.roomRate.findMany({ where: { roomId }, orderBy: { startDate: "asc" } });
  }

  async createRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const pricePerNight = Number(body.pricePerNight);
    this.positive(pricePerNight, "pricePerNight", true);
    const { startDate, endDate } = this.dateRange(String(body.startDate), String(body.endDate));
    return this.prisma.roomRate.create({
      data: { id: randomUUID(), roomId, startDate, endDate, pricePerNight }
    });
  }

  async updateRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, rateId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
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

  async deleteRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, rateId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const existing = await this.prisma.roomRate.findFirst({ where: { id: rateId, roomId } });
    if (!existing) throw new NotFoundException("Room rate not found");
    return this.prisma.roomRate.delete({ where: { id: rateId } });
  }

  async services(user: AuthenticatedUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    return [...homestay.includedServices, ...homestay.services];
  }

  async createService(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
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

  async updateService(user: AuthenticatedUser, homestayId: string, serviceId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
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

  async deleteService(user: AuthenticatedUser, homestayId: string, serviceId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, homestayId } });
    if (!service) throw new NotFoundException("Service not found");
    return this.prisma.service.update({ where: { id: serviceId }, data: { active: false } });
  }

  async visibleBookings(user: AuthenticatedUser): Promise<Booking[]> {
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

  async assertCanAccessBooking(user: AuthenticatedUser, bookingId: string): Promise<Booking> {
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
    if (status !== "PREPARING" && status !== "SERVED") throw new BadRequestException("Invalid service order status");
    const existing = await this.prisma.bookingService.findFirst({ where: { id: serviceOrderId, bookingId } });
    if (!existing) throw new NotFoundException("Booking service not found");
    return this.prisma.bookingService.update({ where: { id: serviceOrderId }, data: { status } });
  }

  async metrics() {
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
    return (await this.prisma.userProfile.findMany({ orderBy: { createdAt: "desc" } })).map((user) => this.mapUser(user));
  }

  async createUser(input: { name?: string; email?: string; phone?: string; role?: UserRole }) {
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
    try {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: userId }, data: { banned } }));
    } catch {
      throw new NotFoundException("User not found");
    }
  }

  async moderateUser(actor: AuthenticatedUser, userId: string, banned: boolean) {
    const target = await this.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");
    if (actor.role !== "ADMIN" && target.role === "ADMIN") {
      throw new ForbiddenException("Staff cannot moderate administrator accounts");
    }
    return this.banUser(userId, banned);
  }

  async setRole(userId: string, role: UserRole) {
    this.validRole(role);
    try {
      return this.mapUser(await this.prisma.userProfile.update({ where: { id: userId }, data: { role } }));
    } catch {
      throw new NotFoundException("User not found");
    }
  }

  async articles(): Promise<Article[]> {
    return (await this.prisma.article.findMany({ orderBy: { createdAt: "desc" } })).map((article) => ({ ...article }));
  }

  async createArticle(input: Partial<Article>) {
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
    const status = input.status ? this.validArticleStatus(input.status) : undefined;
    try {
      return await this.prisma.article.update({ where: { id: articleId }, data: { ...input, status } });
    } catch {
      throw new NotFoundException("Article not found");
    }
  }

  async deleteArticle(articleId: string) {
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
    return (await this.prisma.violationReport.findMany({ orderBy: { createdAt: "desc" } })).map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString()
    }));
  }

  async resolveReport(reportId: string) {
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

  private mapUser(row: any): AuthenticatedUser {
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

  private async assertRoomBelongsToHomestay(user: AuthenticatedUser, homestayId: string, roomId: string) {
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
