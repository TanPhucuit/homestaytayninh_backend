import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { RedisService } from "../redis/redis.service";
import {
  Article,
  AuthenticatedUser,
  Booking,
  BookingService,
  BookingStatus,
  Homestay,
  Payment,
  Review,
  Room,
  Service,
  UserRole,
  ViolationReport
} from "./domain";

type BookingInput = Partial<Booking> & { serviceItems?: Array<{ serviceId: string; quantity: number }> };
type SessionRecord = { token: string; userId: string; createdAt: string; expiresAt: string };
type UserRecord = AuthenticatedUser & { googleSub?: string; passwordHash?: string; createdAt: string; updatedAt: string };
type HomestayRecord = Omit<Homestay, "type" | "amenities" | "includedServices" | "services" | "rooms" | "reviews"> & {
  type: string;
  amenities: string[];
  deleted?: boolean;
  createdAt: string;
  updatedAt: string;
};
type RoomRecord = Room & { createdAt: string; updatedAt: string };
type RoomRateRecord = { id: string; roomId: string; startDate: string; endDate: string; pricePerNight: number; createdAt: string };
type HomestayImageRecord = { id: string; homestayId: string; url: string; alt: string; position: number; createdAt: string };
type ServiceRecord = Service & { createdAt: string };
type BookingRecord = Omit<Booking, "services" | "payment">;
type ArticleRecord = Article & { createdAt: string; updatedAt: string };
type ReportRecord = ViolationReport;

@Injectable()
export class BusinessStoreService implements OnModuleInit {
  private readonly sessionTtlSeconds: number;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) config: ConfigService
  ) {
    this.sessionTtlSeconds = Number(config.get<string>("SESSION_TTL_SECONDS") ?? 60 * 60 * 24 * 7);
  }

  get persistent() {
    return true;
  }

  async onModuleInit() {
    await this.redis.ping();
    if (this.shouldSeedDemoData()) {
      await this.seedDemoDataIfEmpty();
      await this.ensureMinimumDemoRoomsForHomestays();
    }
  }

  async findOrCreateGoogleUser(input: { googleSub: string; email: string; name?: string }) {
    const email = this.email(input.email);
    const sub = String(input.googleSub ?? "").trim();
    if (!sub) throw new ForbiddenException("Google account is missing subject claim");
    const [bySubId, byEmailId] = await Promise.all([
      this.redis.get<string>(this.key("user_google", sub)),
      this.redis.get<string>(this.key("user_email", email))
    ]);
    if (bySubId && byEmailId && bySubId !== byEmailId) {
      throw new ForbiddenException("Google account conflicts with an existing email profile");
    }

    const existingId = bySubId ?? byEmailId;
    if (existingId) {
      const user = await this.requireUser(existingId);
      if (user.banned) throw new ForbiddenException("Authenticated user has no active profile");
      const updated: UserRecord = {
        ...user,
        googleSub: user.googleSub ?? sub,
        authLinked: true,
        name: user.name || input.name || email.split("@")[0],
        updatedAt: this.now()
      };
      await this.saveUser(updated);
      if (updated.role === "CUSTOMER" && this.shouldSeedDemoData()) await this.ensureCustomerDemoBookings(updated);
      return this.mapUser(updated);
    }

    const user: UserRecord = {
      id: this.id("u"),
      name: input.name || email.split("@")[0],
      email,
      role: "CUSTOMER",
      banned: false,
      authLinked: true,
      googleSub: sub,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    await this.saveUser(user);
    if (this.shouldSeedDemoData()) await this.ensureCustomerDemoBookings(user);
    return this.mapUser(user);
  }

  async findAuthenticatedUser(authId: string, email?: string) {
    return this.findOrCreateGoogleUser({ googleSub: authId, email: email ?? "", name: email?.split("@")[0] });
  }

  async loginWithPassword(input: { email?: string; password?: string }) {
    const email = this.email(input.email);
    const password = String(input.password ?? "");
    if (!password) throw new BadRequestException("Password is required");
    const userId = await this.redis.get<string>(this.key("user_email", email));
    if (!userId) throw new UnauthorizedException("Invalid email or password");
    const user = await this.requireUser(userId);
    if (user.banned) throw new ForbiddenException("Authenticated user has no active profile");
    if (!user.passwordHash || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.mapUser(user);
  }

  async createSession(user: AuthenticatedUser) {
    const token = `${randomUUID()}.${randomBytes(24).toString("base64url")}`;
    const createdAt = this.now();
    const record: SessionRecord = {
      token,
      userId: user.id,
      createdAt,
      expiresAt: new Date(Date.now() + this.sessionTtlSeconds * 1000).toISOString()
    };
    await this.redis.set(this.key("session", token), record, this.sessionTtlSeconds);
    return { token, expiresAt: record.expiresAt, user };
  }

  async getSession(token?: string) {
    if (!token) return undefined;
    const record = await this.redis.get<SessionRecord>(this.key("session", token));
    if (!record) return undefined;
    const user = await this.requireUser(record.userId);
    if (user.banned) throw new ForbiddenException("Authenticated user has no active profile");
    return this.mapUser(user);
  }

  async deleteSession(token?: string) {
    if (!token) return 0;
    return this.redis.del(this.key("session", token));
  }

  async catalogList(query: Record<string, string | undefined>): Promise<Homestay[]> {
    const { checkIn, checkOut } = this.optionalDateRange(query.checkIn, query.checkOut);
    const guests = query.guests ? Number(query.guests) : undefined;
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
    const q = String(query.q ?? query.search ?? "").trim().toLowerCase();
    const type = String(query.type ?? "").trim();
    const amenity = String(query.amenity ?? "").trim().toLowerCase();
    const rows = await this.all<HomestayRecord>("idx:homestays", "homestay");
    const mapped = await Promise.all(
      rows
        .filter((row) => !row.deleted)
        .filter((row) => !q || row.name.toLowerCase().includes(q) || row.location.toLowerCase().includes(q))
        .filter((row) => !type || this.sameType(row.type, type))
        .filter((row) => !maxPrice || row.priceFrom <= maxPrice)
        .filter((row) => !guests || row.capacity >= guests)
        .filter((row) => !amenity || row.amenities.some((item) => item.toLowerCase() === amenity))
        .map((row) => this.mapHomestay(row, { checkIn, checkOut, guests }))
    );
    return mapped.filter((homestay) => homestay.rooms.length > 0).sort((a, b) => b.rating - a.rating);
  }

  async catalogDetail(id: string): Promise<Homestay> {
    return this.getHomestay(id);
  }

  async visibleHomestays(user: AuthenticatedUser): Promise<Homestay[]> {
    const rows = await this.all<HomestayRecord>("idx:homestays", "homestay");
    const visible = rows.filter((row) => {
      if (row.deleted) return false;
      if (user.role === "ADMIN") return true;
      if (user.role === "OWNER") return true;
      return false;
    });
    if (user.role === "OWNER_STAFF") {
      const assigned = new Set(await this.redis.smembers(this.key("staff_assignments", user.id)));
      return Promise.all(rows.filter((row) => assigned.has(row.id) && !row.deleted).map((row) => this.mapHomestay(row)));
    }
    return Promise.all(visible.map((row) => this.mapHomestay(row)));
  }

  async getHomestay(homestayId: string): Promise<Homestay> {
    const row = await this.get<HomestayRecord>("homestay", homestayId);
    if (!row || row.deleted) throw new NotFoundException("Homestay not found");
    return this.mapHomestay(row);
  }

  async assertCanManageHomestay(user: AuthenticatedUser, homestayId: string) {
    const homestay = await this.getHomestay(homestayId);
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new ForbiddenException("User cannot manage this homestay");
    }
    return homestay;
  }

  async assertCanOperateHomestay(user: AuthenticatedUser, homestayId: string) {
    if (user.role === "ADMIN") return this.getHomestay(homestayId);
    if (user.role !== "OWNER_STAFF") throw new ForbiddenException("User cannot operate this homestay");
    const assigned = await this.redis.smembers(this.key("staff_assignments", user.id));
    if (!assigned.includes(homestayId)) throw new ForbiddenException("User is not assigned to this homestay");
    return this.getHomestay(homestayId);
  }

  async createHomestay(user: AuthenticatedUser, body: Record<string, unknown>) {
    const ownerId = user.role === "OWNER" ? user.id : String(body.ownerId ?? "").trim();
    if (!ownerId) throw new BadRequestException("ownerId is required for administrator-created homestays");
    await this.requireUser(ownerId);
    const priceFrom = Number(body.priceFrom ?? 500000);
    const capacity = Number(body.capacity ?? 2);
    this.positive(priceFrom, "priceFrom", true);
    this.positive(capacity, "capacity");
    const now = this.now();
    const row: HomestayRecord = {
      id: this.id("hs"),
      ownerId,
      name: String(body.name ?? "Homestay mới"),
      type: String(body.type ?? "Phòng"),
      location: String(body.location ?? "Tây Ninh"),
      description: String(body.description ?? "Mô tả đang cập nhật"),
      priceFrom,
      capacity,
      rating: Number(body.rating ?? 0),
      imageUrl: String(body.imageUrl ?? "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"),
      amenities: this.list(body.amenities),
      createdAt: now,
      updatedAt: now
    };
    await this.redis.set(this.key("homestay", row.id), row);
    await this.redis.sadd("idx:homestays", row.id);
    await this.redis.sadd(this.key("owner_homestays", ownerId), row.id);
    return this.mapHomestay(row);
  }

  async updateHomestay(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const row = await this.require<HomestayRecord>("homestay", homestayId, "Homestay not found");
    const next: HomestayRecord = { ...row, updatedAt: this.now() };
    for (const field of ["name", "type", "location", "description", "imageUrl"] as const) {
      if (body[field] !== undefined) next[field] = String(body[field]);
    }
    if (body.amenities !== undefined) next.amenities = this.list(body.amenities);
    if (body.priceFrom !== undefined) {
      this.positive(Number(body.priceFrom), "priceFrom", true);
      next.priceFrom = Number(body.priceFrom);
    }
    if (body.capacity !== undefined) {
      this.positive(Number(body.capacity), "capacity");
      next.capacity = Number(body.capacity);
    }
    await this.redis.set(this.key("homestay", homestayId), next);
    return this.mapHomestay(next);
  }

  async deleteHomestay(user: AuthenticatedUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const row = await this.require<HomestayRecord>("homestay", homestayId, "Homestay not found");
    const next = { ...row, deleted: true, updatedAt: this.now() };
    await this.redis.set(this.key("homestay", homestayId), next);
    await this.redis.srem("idx:homestays", homestayId);
    return this.mapHomestay(next);
  }

  async images(user: AuthenticatedUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    return this.imagesForHomestay(homestayId);
  }

  async createImage(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const url = String(body.url ?? "").trim();
    if (!url) throw new BadRequestException("Image URL is required");
    const position = Number(body.position ?? 0);
    this.positive(position, "position", true);
    const image: HomestayImageRecord = {
      id: this.id("img"),
      homestayId,
      url,
      alt: String(body.alt ?? ""),
      position,
      createdAt: this.now()
    };
    await this.redis.set(this.key("homestay_image", image.id), image);
    await this.redis.sadd(this.key("homestay_images", homestayId), image.id);
    if (position === 0) await this.updateHomestay(user, homestayId, { imageUrl: url });
    return image;
  }

  async updateImage(user: AuthenticatedUser, homestayId: string, imageId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const image = await this.require<HomestayImageRecord>("homestay_image", imageId, "Image not found");
    if (image.homestayId !== homestayId) throw new NotFoundException("Image not found");
    const next = { ...image };
    if (body.url !== undefined) next.url = String(body.url);
    if (body.alt !== undefined) next.alt = String(body.alt);
    if (body.position !== undefined) {
      this.positive(Number(body.position), "position", true);
      next.position = Number(body.position);
    }
    await this.redis.set(this.key("homestay_image", imageId), next);
    if (next.position === 0) await this.updateHomestay(user, homestayId, { imageUrl: next.url });
    return next;
  }

  async deleteImage(user: AuthenticatedUser, homestayId: string, imageId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const image = await this.require<HomestayImageRecord>("homestay_image", imageId, "Image not found");
    if (image.homestayId !== homestayId) throw new NotFoundException("Image not found");
    await this.redis.del(this.key("homestay_image", imageId));
    await this.redis.srem(this.key("homestay_images", homestayId), imageId);
    return image;
  }

  async rooms(user: AuthenticatedUser, homestayId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    return this.roomsForHomestay(homestayId);
  }

  async createRoom(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    const pricePerNight = Number(body.pricePerNight ?? homestay.priceFrom);
    const capacity = Number(body.capacity ?? 2);
    const totalUnits = Number(body.totalUnits ?? 1);
    this.positive(pricePerNight, "pricePerNight", true);
    this.positive(capacity, "capacity");
    this.positive(totalUnits, "totalUnits");
    const now = this.now();
    const room: RoomRecord = {
      id: this.id("room"),
      homestayId,
      name: String(body.name ?? "Phòng mới"),
      roomType: String(body.roomType ?? homestay.type),
      imageUrl: String(body.imageUrl || homestay.imageUrl),
      pricePerNight,
      capacity,
      totalUnits,
      active: body.active === undefined ? true : Boolean(body.active),
      createdAt: now,
      updatedAt: now
    };
    await this.redis.set(this.key("room", room.id), room);
    await this.redis.sadd(this.key("homestay_rooms", homestayId), room.id);
    return room;
  }

  async updateRoom(user: AuthenticatedUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const room = await this.require<RoomRecord>("room", roomId, "Room not found");
    const next = { ...room, updatedAt: this.now() };
    for (const field of ["name", "roomType", "imageUrl"] as const) {
      if (body[field] !== undefined) next[field] = String(body[field]);
    }
    for (const field of ["pricePerNight", "capacity", "totalUnits"] as const) {
      if (body[field] !== undefined) {
        this.positive(Number(body[field]), field, field === "pricePerNight");
        next[field] = Number(body[field]);
      }
    }
    if (body.active !== undefined) next.active = Boolean(body.active);
    await this.redis.set(this.key("room", roomId), next);
    return next;
  }

  async deleteRoom(user: AuthenticatedUser, homestayId: string, roomId: string) {
    return this.updateRoom(user, homestayId, roomId, { active: false });
  }

  async roomRates(user: AuthenticatedUser, homestayId: string, roomId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    return this.ratesForRoom(roomId);
  }

  async createRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const pricePerNight = Number(body.pricePerNight);
    this.positive(pricePerNight, "pricePerNight", true);
    const { startDate, endDate } = this.dateRange(String(body.startDate), String(body.endDate));
    const rate: RoomRateRecord = { id: this.id("rate"), roomId, startDate, endDate, pricePerNight, createdAt: this.now() };
    await this.redis.set(this.key("room_rate", rate.id), rate);
    await this.redis.sadd(this.key("room_rates", roomId), rate.id);
    return rate;
  }

  async updateRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, rateId: string, body: Record<string, unknown>) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const rate = await this.require<RoomRateRecord>("room_rate", rateId, "Room rate not found");
    if (rate.roomId !== roomId) throw new NotFoundException("Room rate not found");
    const next = { ...rate };
    if (body.pricePerNight !== undefined) {
      this.positive(Number(body.pricePerNight), "pricePerNight", true);
      next.pricePerNight = Number(body.pricePerNight);
    }
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const range = this.dateRange(String(body.startDate ?? rate.startDate), String(body.endDate ?? rate.endDate));
      next.startDate = range.startDate;
      next.endDate = range.endDate;
    }
    await this.redis.set(this.key("room_rate", rateId), next);
    return next;
  }

  async deleteRoomRate(user: AuthenticatedUser, homestayId: string, roomId: string, rateId: string) {
    await this.assertRoomBelongsToHomestay(user, homestayId, roomId);
    const rate = await this.require<RoomRateRecord>("room_rate", rateId, "Room rate not found");
    if (rate.roomId !== roomId) throw new NotFoundException("Room rate not found");
    await this.redis.del(this.key("room_rate", rateId));
    await this.redis.srem(this.key("room_rates", roomId), rateId);
    return rate;
  }

  async services(user: AuthenticatedUser, homestayId: string) {
    const homestay = await this.assertCanManageHomestay(user, homestayId);
    return [...homestay.includedServices, ...homestay.services];
  }

  async createService(user: AuthenticatedUser, homestayId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const unitPrice = Number(body.unitPrice ?? 0);
    this.positive(unitPrice, "unitPrice", true);
    const service: ServiceRecord = {
      id: this.id("svc"),
      homestayId,
      name: String(body.name ?? "Dịch vụ mới"),
      description: body.description === undefined ? undefined : String(body.description),
      unitPrice,
      included: Boolean(body.included ?? false),
      active: body.active === undefined ? true : Boolean(body.active),
      createdAt: this.now()
    };
    await this.redis.set(this.key("service", service.id), service);
    await this.redis.sadd(this.key("homestay_services", homestayId), service.id);
    return service;
  }

  async updateService(user: AuthenticatedUser, homestayId: string, serviceId: string, body: Record<string, unknown>) {
    await this.assertCanManageHomestay(user, homestayId);
    const service = await this.require<ServiceRecord>("service", serviceId, "Service not found");
    if (service.homestayId !== homestayId) throw new NotFoundException("Service not found");
    const next = { ...service };
    for (const field of ["name", "description"] as const) {
      if (body[field] !== undefined) next[field] = String(body[field]);
    }
    if (body.unitPrice !== undefined) {
      this.positive(Number(body.unitPrice), "unitPrice", true);
      next.unitPrice = Number(body.unitPrice);
    }
    if (body.included !== undefined) next.included = Boolean(body.included);
    if (body.active !== undefined) next.active = Boolean(body.active);
    await this.redis.set(this.key("service", serviceId), next);
    return next;
  }

  async deleteService(user: AuthenticatedUser, homestayId: string, serviceId: string) {
    return this.updateService(user, homestayId, serviceId, { active: false });
  }

  async visibleBookings(user: AuthenticatedUser): Promise<Booking[]> {
    const rows = await this.all<BookingRecord>("idx:bookings", "booking");
    const mapped = await Promise.all(rows.map((row) => this.mapBooking(row)));
    const filtered = [];
    for (const booking of mapped) {
      if (user.role === "ADMIN") filtered.push(booking);
      else if (user.role === "CUSTOMER" && booking.customerId === user.id) filtered.push(booking);
      else {
        const homestay = await this.get<HomestayRecord>("homestay", booking.homestayId);
        if (user.role === "OWNER" && homestay?.ownerId === user.id) filtered.push(booking);
        if (user.role === "OWNER_STAFF" && (await this.redis.smembers(this.key("staff_assignments", user.id))).includes(booking.homestayId)) {
          filtered.push(booking);
        }
      }
    }
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async assertCanAccessBooking(user: AuthenticatedUser, bookingId: string): Promise<Booking> {
    const row = await this.require<BookingRecord>("booking", bookingId, "Booking not found");
    const homestay = await this.require<HomestayRecord>("homestay", row.homestayId, "Homestay not found");
    const allowed =
      user.role === "ADMIN" ||
      (user.role === "CUSTOMER" && row.customerId === user.id) ||
      (user.role === "OWNER" && homestay.ownerId === user.id) ||
      (user.role === "OWNER_STAFF" && (await this.redis.smembers(this.key("staff_assignments", user.id))).includes(row.homestayId));
    if (!allowed) throw new ForbiddenException("User cannot access this booking");
    return this.mapBooking(row);
  }

  async createBooking(input: BookingInput): Promise<Booking> {
    if (!input.homestayId) throw new BadRequestException("Homestay is required");
    if (!input.customerId) throw new BadRequestException("Customer is required");
    await this.requireUser(String(input.customerId));
    const homestay = await this.getHomestay(String(input.homestayId));
    if (!input.roomId) throw new BadRequestException("Room is required");
    const room = homestay.rooms.find((item) => item.id === input.roomId);
    if (!room) throw new BadRequestException("Room does not belong to this homestay");
    if (!room.active) throw new BadRequestException("Room is not available for booking");
    const guestCount = Number(input.guestCount ?? 1);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > room.capacity) {
      throw new BadRequestException("Guest count exceeds room capacity");
    }
    const checkIn = this.toDateOnly(String(input.checkIn), "checkIn");
    const checkOut = this.toDateOnly(String(input.checkOut), "checkOut");
    const nights = this.nights(checkIn, checkOut);
    if ((await this.availableUnits(room.id, checkIn, checkOut)) <= 0) {
      throw new BadRequestException("Room is no longer available for the selected dates");
    }

    const services = await this.servicesForHomestay(homestay.id);
    const addOns = (input.serviceItems ?? []).map((item) => {
      const service = services.find((candidate) => candidate.id === item.serviceId && !candidate.included && candidate.active);
      if (!service) throw new NotFoundException(`Service ${item.serviceId} not found`);
      this.positive(Number(item.quantity), "quantity");
      return { service, quantity: Number(item.quantity), total: service.unitPrice * Number(item.quantity) };
    });
    const serviceTotal = addOns.reduce((total, item) => total + item.total, 0);
    const nightlyRate = this.priceForStay(room.pricePerNight, await this.ratesForRoom(room.id), checkIn, checkOut);
    const roomTotal = nightlyRate * nights;
    const taxTotal = Math.round((roomTotal + serviceTotal) * 0.1);
    const grandTotal = roomTotal + serviceTotal + taxTotal;
    const bookingId = this.id("bk");
    const booking: BookingRecord = {
      id: bookingId,
      customerId: String(input.customerId),
      homestayId: homestay.id,
      roomId: room.id,
      guestName: String(input.guestName ?? "Khach hang"),
      guestPhone: String(input.guestPhone ?? "0900000000"),
      guestCount,
      checkIn,
      checkOut,
      status: "PENDING",
      roomTotal,
      serviceTotal,
      taxTotal,
      grandTotal,
      proxyCreatedBy: input.proxyCreatedBy,
      createdAt: this.now()
    };
    await this.redis.set(this.key("booking", bookingId), booking);
    await this.redis.sadd("idx:bookings", bookingId);
    await this.redis.sadd(this.key("customer_bookings", booking.customerId), bookingId);
    await Promise.all(
      addOns.map(({ service, quantity, total }) =>
        this.saveBookingService({
          id: this.id("bs"),
          bookingId,
          serviceId: service.id,
          name: service.name,
          quantity,
          unitPrice: service.unitPrice,
          total,
          status: "PREPARING"
        })
      )
    );
    return this.mapBooking(booking);
  }

  async resolveBookingCustomer(input: { customerId?: unknown; customerEmail?: unknown; email?: unknown; guestName?: unknown; guestPhone?: unknown }) {
    const explicitId = String(input.customerId ?? "").trim();
    if (explicitId) {
      await this.requireUser(explicitId);
      return explicitId;
    }
    const emailValue = String(input.customerEmail ?? input.email ?? "").trim().toLowerCase();
    if (emailValue) {
      const existing = await this.redis.get<string>(this.key("user_email", emailValue));
      if (existing) return existing;
      const user = await this.createUser({ email: emailValue, name: String(input.guestName ?? emailValue.split("@")[0]), role: "CUSTOMER" });
      return user.id;
    }
    const phone = String(input.guestPhone ?? "").trim();
    const name = String(input.guestName ?? "Khach dat truc tiep").trim() || "Khach dat truc tiep";
    if (!phone) throw new BadRequestException("Guest phone is required when customerId is not provided");
    const users = await this.all<UserRecord>("idx:users", "user");
    const existing = users.find((user) => user.phone === phone && user.role === "CUSTOMER");
    if (existing) return existing.id;
    const digits = phone.replace(/\D/g, "").slice(-12) || randomUUID();
    const profile = await this.createUser({ name, email: `guest-${digits}-${Date.now()}@guest.local`, phone, role: "CUSTOMER" });
    return profile.id;
  }

  async addServiceToBooking(bookingId: string, serviceId: string, quantity = 1, actorId?: string): Promise<Booking> {
    this.positive(quantity, "quantity");
    const booking = await this.require<BookingRecord>("booking", bookingId, "Booking not found");
    if (booking.status !== "IN_STAY") throw new BadRequestException("Add-on service is only available while booking is IN_STAY");
    const service = (await this.servicesForHomestay(booking.homestayId)).find((item) => item.id === serviceId && !item.included && item.active);
    if (!service) throw new NotFoundException("Service not found");
    const total = service.unitPrice * quantity;
    const nextServiceTotal = booking.serviceTotal + total;
    const nextTaxTotal = Math.round((booking.roomTotal + nextServiceTotal) * 0.1);
    const nextGrandTotal = booking.roomTotal + nextServiceTotal + nextTaxTotal;
    const next: BookingRecord = { ...booking, serviceTotal: nextServiceTotal, taxTotal: nextTaxTotal, grandTotal: nextGrandTotal };
    await this.saveBookingService({
      id: this.id("bs"),
      bookingId,
      serviceId: service.id,
      name: service.name,
      quantity,
      unitPrice: service.unitPrice,
      total,
      status: "PREPARING"
    });
    await this.redis.set(this.key("booking", bookingId), next);
    const payment = await this.redis.get<Payment>(this.key("payment_booking", bookingId));
    if (payment) await this.savePayment({ ...payment, amount: nextGrandTotal });
    void actorId;
    return this.mapBooking(next);
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus, actorId?: string, actorRole?: UserRole): Promise<Booking> {
    const booking = await this.require<BookingRecord>("booking", bookingId, "Booking not found");
    if (actorRole === "CUSTOMER" && (status !== "CANCELLED" || !["PENDING", "CONFIRMED"].includes(booking.status))) {
      throw new ForbiddenException("Customer can only cancel pending or confirmed bookings");
    }
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
    const next: BookingRecord = { ...booking, status };
    await this.redis.set(this.key("booking", bookingId), next);
    if (status === "CANCELLED") {
      const payment = await this.redis.get<Payment>(this.key("payment_booking", bookingId));
      if (payment && payment.status !== "PAID") {
        await this.savePayment({ ...payment, status: "CANCELLED", checkoutUrl: undefined, qrUrl: undefined });
      }
    }
    void actorId;
    return this.mapBooking(next);
  }

  async upsertPayment(bookingId: string, payment: Omit<Payment, "id" | "bookingId">, actorId?: string) {
    const statuses: Payment["status"][] = ["INITIATED", "PENDING", "PAID", "FAILED", "CANCELLED"];
    if (!statuses.includes(payment.status)) throw new BadRequestException("Invalid payment status");
    const booking = await this.require<BookingRecord>("booking", bookingId, "Booking not found");
    if (booking.status === "CANCELLED" && payment.status !== "CANCELLED") {
      throw new BadRequestException("Cannot update payment for a cancelled booking");
    }
    const existing = await this.redis.get<Payment>(this.key("payment_booking", bookingId));
    const row: Payment = { id: existing?.id ?? this.id("pay"), bookingId, ...payment };
    await this.savePayment(row);
    void actorId;
    return row;
  }

  async bookingByPaymentProviderRef(provider: string, providerRef: string) {
    const payment = await this.redis.get<Payment>(this.key("payment_provider", `${provider}:${providerRef}`));
    if (payment) {
      const booking = await this.get<BookingRecord>("booking", payment.bookingId);
      return booking ? this.mapBooking(booking) : null;
    }
    const bookings = await this.all<BookingRecord>("idx:bookings", "booking");
    for (const row of bookings) {
      const candidate = await this.redis.get<Payment>(this.key("payment_booking", row.id));
      if (candidate?.provider === provider && candidate.providerRef === providerRef) return this.mapBooking(row);
    }
    return null;
  }

  async setServiceOrderStatus(bookingId: string, serviceOrderId: string, status: BookingService["status"]) {
    if (status !== "PREPARING" && status !== "SERVED") throw new BadRequestException("Invalid service order status");
    const serviceOrder = await this.require<BookingService>("booking_service", serviceOrderId, "Booking service not found");
    if (serviceOrder.bookingId !== bookingId) throw new NotFoundException("Booking service not found");
    if (serviceOrder.status === "SERVED" && status === "PREPARING") {
      throw new BadRequestException("Cannot move a served service order back to preparing");
    }
    const next = { ...serviceOrder, status };
    await this.redis.set(this.key("booking_service", serviceOrderId), next);
    return next;
  }

  async metrics() {
    const bookings = await Promise.all((await this.all<BookingRecord>("idx:bookings", "booking")).map((row) => this.mapBooking(row)));
    const homestays = await this.all<HomestayRecord>("idx:homestays", "homestay");
    return {
      transactions: bookings.length,
      revenue: bookings.reduce((sum, item) => sum + (item.payment?.status === "PAID" ? item.grandTotal : 0), 0),
      occupancyRate: bookings.length ? Math.round((bookings.filter((item) => item.status === "IN_STAY").length / bookings.length) * 100) : 0,
      completed: bookings.filter((item) => item.status === "COMPLETED").length,
      homestayPerformance: await Promise.all(
        homestays.map(async (homestay) => ({
          homestayId: homestay.id,
          name: homestay.name,
          bookings: bookings.filter((booking) => booking.homestayId === homestay.id).length
        }))
      )
    };
  }

  async users() {
    const users = await this.all<UserRecord>("idx:users", "user");
    return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((user) => this.mapUser(user));
  }

  async createUser(input: { name?: string; email?: string; phone?: string; role?: UserRole }) {
    const email = this.email(input.email);
    const existing = await this.redis.get<string>(this.key("user_email", email));
    if (existing) throw new BadRequestException("Email already exists");
    const now = this.now();
    const user: UserRecord = {
      id: this.id("u"),
      name: String(input.name ?? email.split("@")[0]),
      email,
      phone: input.phone,
      role: this.validRole(input.role ?? "CUSTOMER"),
      banned: false,
      authLinked: false,
      createdAt: now,
      updatedAt: now
    };
    await this.saveUser(user);
    return this.mapUser(user);
  }

  async banUser(userId: string, banned = true) {
    const user = await this.requireUser(userId);
    const next = { ...user, banned, updatedAt: this.now() };
    await this.saveUser(next);
    return this.mapUser(next);
  }

  async moderateUser(actor: AuthenticatedUser, userId: string, banned: boolean) {
    const target = await this.requireUser(userId);
    if (actor.role === "STAFF" && target.role !== "CUSTOMER") {
      throw new ForbiddenException("Staff can only moderate customer accounts");
    }
    if (target.role === "ADMIN" && banned && (await this.activeAdminCount()) <= 1) {
      throw new ForbiddenException("Cannot ban the last active administrator");
    }
    return this.banUser(userId, banned);
  }

  async setRole(userId: string, role: UserRole, actor?: AuthenticatedUser) {
    this.validRole(role);
    const target = await this.requireUser(userId);
    if (target.role === "ADMIN" && role !== "ADMIN" && (await this.activeAdminCount()) <= 1) {
      throw new ForbiddenException("Cannot demote the last active administrator");
    }
    if (actor?.id === userId && role !== "ADMIN") {
      throw new ForbiddenException("Administrators cannot demote their own account");
    }
    const next = { ...target, role, updatedAt: this.now() };
    await this.saveUser(next);
    return this.mapUser(next);
  }

  async articles(): Promise<Article[]> {
    return (await this.all<ArticleRecord>("idx:articles", "article")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async publishedArticles(): Promise<Article[]> {
    return (await this.all<ArticleRecord>("idx:articles", "article"))
      .filter((article) => article.status === "PUBLISHED")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async publishedArticle(slug: string): Promise<Article> {
    const id = await this.redis.get<string>(this.key("article_slug", slug));
    const article = id ? await this.get<ArticleRecord>("article", id) : undefined;
    if (!article || article.status !== "PUBLISHED") throw new NotFoundException("Article not found");
    return article;
  }

  async createArticle(input: Partial<Article>) {
    const status = this.validArticleStatus(input.status ?? "DRAFT");
    const now = this.now();
    const article: ArticleRecord = {
      id: this.id("art"),
      authorId: input.authorId ?? "u-staff-demo",
      title: String(input.title ?? "Bài viết mới"),
      slug: String(input.slug ?? this.id("article")),
      imageUrl: String(input.imageUrl || "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=85"),
      excerpt: String(input.excerpt ?? ""),
      content: String(input.content ?? ""),
      status,
      createdAt: now,
      updatedAt: now
    };
    await this.saveArticle(article);
    return article;
  }

  async updateArticle(articleId: string, input: Partial<Article>) {
    const article = await this.require<ArticleRecord>("article", articleId, "Article not found");
    const next: ArticleRecord = { ...article, ...input, updatedAt: this.now() };
    if (input.status) next.status = this.validArticleStatus(input.status);
    if (input.slug && input.slug !== article.slug) await this.redis.del(this.key("article_slug", article.slug));
    await this.saveArticle(next);
    return next;
  }

  async deleteArticle(articleId: string) {
    const article = await this.require<ArticleRecord>("article", articleId, "Article not found");
    await this.redis.del(this.key("article", articleId));
    await this.redis.del(this.key("article_slug", article.slug));
    await this.redis.srem("idx:articles", articleId);
    return article;
  }

  async setArticleStatus(articleId: string, status: Article["status"]) {
    return this.updateArticle(articleId, { status });
  }

  async reports(): Promise<ViolationReport[]> {
    return (await this.all<ReportRecord>("idx:reports", "report")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveReport(reportId: string) {
    const report = await this.require<ReportRecord>("report", reportId, "Violation report not found");
    const next: ReportRecord = { ...report, status: "RESOLVED" };
    await this.redis.set(this.key("report", reportId), next);
    return next;
  }

  private async mapHomestay(row: HomestayRecord, availability?: { checkIn?: string; checkOut?: string; guests?: number }): Promise<Homestay & { images: HomestayImageRecord[] }> {
    const rooms = await this.roomsForHomestay(row.id);
    const filteredRooms = [];
    for (const room of rooms.filter((item) => item.active && (!availability?.guests || item.capacity >= availability.guests))) {
      if (availability?.checkIn && availability.checkOut && (await this.availableUnits(room.id, availability.checkIn, availability.checkOut)) <= 0) continue;
      filteredRooms.push(room);
    }
    const services = await this.servicesForHomestay(row.id);
    return {
      ...row,
      type: row.type,
      amenities: row.amenities ?? [],
      includedServices: services.filter((service) => service.included && service.active),
      services: services.filter((service) => !service.included && service.active),
      rooms: filteredRooms,
      reviews: await this.reviewsForHomestay(row.id),
      images: await this.imagesForHomestay(row.id)
    };
  }

  private async mapBooking(row: BookingRecord): Promise<Booking> {
    return {
      ...row,
      services: await this.bookingServices(row.id),
      payment: await this.redis.get<Payment>(this.key("payment_booking", row.id))
    };
  }

  private mapUser(row: UserRecord): AuthenticatedUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      banned: row.banned,
      authLinked: Boolean(row.authLinked || row.googleSub)
    };
  }

  private async roomsForHomestay(homestayId: string) {
    const ids = await this.redis.smembers(this.key("homestay_rooms", homestayId));
    const rooms = await Promise.all(ids.map((id) => this.get<RoomRecord>("room", id)));
    return rooms.filter(Boolean).sort((a, b) => a!.createdAt.localeCompare(b!.createdAt)) as RoomRecord[];
  }

  private async ratesForRoom(roomId: string) {
    const ids = await this.redis.smembers(this.key("room_rates", roomId));
    const rates = await Promise.all(ids.map((id) => this.get<RoomRateRecord>("room_rate", id)));
    return rates.filter(Boolean).sort((a, b) => a!.startDate.localeCompare(b!.startDate)) as RoomRateRecord[];
  }

  private async servicesForHomestay(homestayId: string) {
    const ids = await this.redis.smembers(this.key("homestay_services", homestayId));
    const services = await Promise.all(ids.map((id) => this.get<ServiceRecord>("service", id)));
    return services.filter(Boolean).sort((a, b) => a!.createdAt.localeCompare(b!.createdAt)) as ServiceRecord[];
  }

  private async imagesForHomestay(homestayId: string) {
    const ids = await this.redis.smembers(this.key("homestay_images", homestayId));
    const images = await Promise.all(ids.map((id) => this.get<HomestayImageRecord>("homestay_image", id)));
    return images.filter(Boolean).sort((a, b) => a!.position - b!.position || a!.createdAt.localeCompare(b!.createdAt)) as HomestayImageRecord[];
  }

  private async reviewsForHomestay(homestayId: string) {
    const ids = await this.redis.smembers(this.key("homestay_reviews", homestayId));
    const reviews = await Promise.all(ids.map((id) => this.get<Review>("review", id)));
    return reviews.filter(Boolean) as Review[];
  }

  private async bookingServices(bookingId: string) {
    const ids = await this.redis.smembers(this.key("booking_services", bookingId));
    const services = await Promise.all(ids.map((id) => this.get<BookingService>("booking_service", id)));
    return services.filter(Boolean) as BookingService[];
  }

  private async availableUnits(roomId: string, checkIn: string, checkOut: string) {
    const room = await this.require<RoomRecord>("room", roomId, "Room not found");
    const bookings = await this.all<BookingRecord>("idx:bookings", "booking");
    const reserved = bookings.filter(
      (booking) => booking.roomId === roomId && ["PENDING", "CONFIRMED", "IN_STAY"].includes(booking.status) && this.overlaps(booking.checkIn, booking.checkOut, checkIn, checkOut)
    ).length;
    return room.totalUnits - reserved;
  }

  private async assertRoomBelongsToHomestay(user: AuthenticatedUser, homestayId: string, roomId: string) {
    await this.assertCanManageHomestay(user, homestayId);
    const room = await this.get<RoomRecord>("room", roomId);
    if (!room || room.homestayId !== homestayId) throw new NotFoundException("Room not found");
    return room;
  }

  private async saveUser(user: UserRecord) {
    await this.redis.set(this.key("user", user.id), user);
    await this.redis.set(this.key("user_email", user.email), user.id);
    if (user.googleSub) await this.redis.set(this.key("user_google", user.googleSub), user.id);
    await this.redis.sadd("idx:users", user.id);
  }

  private async saveArticle(article: ArticleRecord) {
    await this.redis.set(this.key("article", article.id), article);
    await this.redis.set(this.key("article_slug", article.slug), article.id);
    await this.redis.sadd("idx:articles", article.id);
  }

  private async savePayment(payment: Payment) {
    await this.redis.set(this.key("payment", payment.id), payment);
    await this.redis.set(this.key("payment_booking", payment.bookingId), payment);
    if (payment.provider && payment.providerRef) {
      await this.redis.set(this.key("payment_provider", `${payment.provider}:${payment.providerRef}`), payment);
    }
  }

  private async saveBookingService(service: BookingService) {
    await this.redis.set(this.key("booking_service", service.id), service);
    await this.redis.sadd(this.key("booking_services", service.bookingId), service.id);
  }

  private async requireUser(userId: string) {
    return this.require<UserRecord>("user", userId, "User not found");
  }

  private async activeAdminCount() {
    return (await this.all<UserRecord>("idx:users", "user")).filter((user) => user.role === "ADMIN" && !user.banned).length;
  }

  private async all<T>(indexKey: string, entity: string) {
    const ids = await this.redis.smembers(indexKey);
    const values = await Promise.all(ids.map((id) => this.get<T>(entity, id)));
    return values.filter(Boolean) as T[];
  }

  private async get<T>(entity: string, id: string) {
    return this.redis.get<T>(this.key(entity, id));
  }

  private async require<T>(entity: string, id: string, message: string) {
    const value = await this.get<T>(entity, id);
    if (!value) throw new NotFoundException(message);
    return value;
  }

  private validRole(role: UserRole | string) {
    const roles: UserRole[] = ["CUSTOMER", "OWNER", "OWNER_STAFF", "STAFF", "ADMIN"];
    if (!roles.includes(role as UserRole)) throw new BadRequestException("Invalid user role");
    return role as UserRole;
  }

  private validArticleStatus(status: Article["status"]) {
    if (status !== "DRAFT" && status !== "PUBLISHED") throw new BadRequestException("Invalid article status");
    return status;
  }

  private positive(value: number, name: string, allowZero = false) {
    const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
    if (!valid) throw new BadRequestException(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }

  private optionalDateRange(checkIn?: string, checkOut?: string) {
    if (!checkIn && !checkOut) return {};
    if (!checkIn || !checkOut) throw new BadRequestException("Both checkIn and checkOut are required for availability search");
    const start = this.toDateOnly(checkIn, "checkIn");
    const end = this.toDateOnly(checkOut, "checkOut");
    if (end <= start) throw new BadRequestException("checkOut must be after checkIn");
    return { checkIn: start, checkOut: end };
  }

  private dateRange(start: string, end: string) {
    const startDate = this.toDateOnly(start, "startDate");
    const endDate = this.toDateOnly(end, "endDate");
    if (endDate < startDate) throw new BadRequestException("End date must be on or after start date");
    return { startDate, endDate };
  }

  private nights(checkIn: string, checkOut: string) {
    const start = new Date(`${checkIn}T00:00:00Z`).getTime();
    const end = new Date(`${checkOut}T00:00:00Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new BadRequestException("Check-out must be after check-in");
    }
    return Math.ceil((end - start) / 86_400_000);
  }

  private priceForStay(defaultPrice: number, rates: RoomRateRecord[], checkIn: string, checkOut: string) {
    const matchingRate = rates.find((rate) => rate.startDate <= checkIn && rate.endDate >= checkOut);
    return matchingRate?.pricePerNight ?? defaultPrice;
  }

  private toDateOnly(value: string, field: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date.toISOString().slice(0, 10);
  }

  private overlaps(leftIn: string, leftOut: string, rightIn: string, rightOut: string) {
    return leftIn < rightOut && leftOut > rightIn;
  }

  private email(value?: string) {
    const email = String(value ?? "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Email is required");
    return email;
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const hash = scryptSync(password, salt, 64).toString("base64url");
    return `scrypt:${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string) {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private list(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
    return [];
  }

  private sameType(left: string, right: string) {
    if (left === right) return true;
    const l = left.toLowerCase();
    const r = right.toLowerCase();
    if (l === r) return true;
    if (r.includes("ph") && l.includes("phong")) return true;
    if ((r.includes("le") || r.includes("l")) && l.includes("leu")) return true;
    if (r.includes("nh") && l.includes("nha")) return true;
    return false;
  }

  private key(entity: string, id: string) {
    return `${entity}:${id}`;
  }

  private id(prefix: string) {
    return `${prefix}-${randomUUID()}`;
  }

  private now() {
    return new Date().toISOString();
  }

  private shouldSeedDemoData() {
    if (process.env.REDIS_AUTO_SEED === "false") return false;
    return true;
  }

  private async ensureMinimumDemoRoomsForHomestays() {
    const now = this.now();
    const homestays = (await this.all<HomestayRecord>("idx:homestays", "homestay")).filter((item) => !item.deleted);
    for (const homestay of homestays) {
      if (homestay.capacity < 4) {
        await this.redis.set(this.key("homestay", homestay.id), { ...homestay, capacity: 4, updatedAt: now });
      }

      const rooms = await this.roomsForHomestay(homestay.id);
      const activeCapacities = new Set(rooms.filter((room) => room.active).map((room) => room.capacity));
      const basePrice = Math.max(300000, Number(homestay.priceFrom || 500000));
      const plans = [
        {
          suffix: "single",
          name: "Phòng 1 người",
          roomType: "Phòng 1 người",
          capacity: 1,
          totalUnits: 4,
          pricePerNight: this.roundPrice(basePrice * 0.72)
        },
        {
          suffix: "double",
          name: "Phòng 2 người",
          roomType: "Phòng 2 người",
          capacity: 2,
          totalUnits: 3,
          pricePerNight: this.roundPrice(basePrice)
        },
        {
          suffix: "quad",
          name: "Phòng 4 người",
          roomType: "Phòng 4 người",
          capacity: 4,
          totalUnits: 2,
          pricePerNight: this.roundPrice(basePrice * 1.45)
        }
      ];

      for (const plan of plans) {
        if (activeCapacities.has(plan.capacity)) continue;
        const id = `room-${homestay.id}-${plan.suffix}`;
        const existing = await this.get<RoomRecord>("room", id);
        if (existing) {
          await this.redis.sadd(this.key("homestay_rooms", homestay.id), id);
          continue;
        }
        const room: RoomRecord = {
          id,
          homestayId: homestay.id,
          name: plan.name,
          roomType: plan.roomType,
          imageUrl: homestay.imageUrl,
          pricePerNight: plan.pricePerNight,
          capacity: plan.capacity,
          totalUnits: plan.totalUnits,
          active: true,
          createdAt: now,
          updatedAt: now
        };
        await this.redis.set(this.key("room", room.id), room);
        await this.redis.sadd(this.key("homestay_rooms", homestay.id), room.id);
      }
    }
  }

  private roundPrice(value: number) {
    return Math.max(200000, Math.round(value / 10000) * 10000);
  }

  private async seedDemoDataIfEmpty() {
    const now = this.now();
    const users: UserRecord[] = [
      { id: "u-admin-demo", name: "Admin HTTN", email: "23521197@gm.uit.edu.vn", role: "ADMIN", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-admin-demo-email", name: "Admin Demo", email: "admindemo@gmail.com", role: "ADMIN", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-staff-demo", name: "Nhân viên nội dung", email: "staff.demo@homestay.local", role: "STAFF", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-content-staff-demo", name: "Content Staff Demo", email: "content_staffdemo@gmail.com", role: "STAFF", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-owner-demo", name: "Chủ nhà Bà Đen", email: "owner.demo@homestay.local", role: "OWNER", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-owner-demo-email", name: "Owner Demo", email: "ownerdemo@gmail.com", role: "OWNER", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-owner-demo-2", name: "Chủ nhà ven hồ", email: "owner2.demo@homestay.local", role: "OWNER", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-owner-staff-demo", name: "Lễ tân owner", email: "ownerstaff.demo@homestay.local", role: "OWNER_STAFF", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-manager-staff-demo", name: "Manager Staff Demo", email: "manager_staff@gmail.com", role: "OWNER_STAFF", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now },
      { id: "u-customer-demo", name: "Khách demo", email: "customer.demo@homestay.local", phone: "0901000001", role: "CUSTOMER", banned: false, authLinked: true, passwordHash: this.hashPassword("demo123"), createdAt: now, updatedAt: now }
    ];
    users.push({
      id: "u-customer-password-demo",
      name: "Khách demo",
      email: "demo@gmail.com",
      phone: "0901000002",
      role: "CUSTOMER",
      banned: false,
      authLinked: true,
      passwordHash: this.hashPassword("demo123"),
      createdAt: now,
      updatedAt: now
    });
    await Promise.all(users.map((user) => this.upsertDemoUser(user)));

    const homestays: HomestayRecord[] = [
      {
        id: "hs-ba-den",
        ownerId: "u-owner-demo",
        name: "Nhà vườn núi Bà Đen",
        type: "Nhà nguyên căn",
        location: "Thạnh Tân, Tây Ninh",
        description: "Không gian vườn yên tĩnh gần núi Bà Đen, phù hợp gia đình và nhóm bạn.",
        priceFrom: 650000,
        capacity: 6,
        rating: 4.8,
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Bếp", "Máy lạnh", "Bãi đậu xe"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-trang-bang",
        ownerId: "u-owner-demo",
        name: "Lưu trú ven hồ Dầu Tiếng",
        type: "Phòng",
        location: "Dương Minh Châu, Tây Ninh",
        description: "Phòng nghỉ view hồ, có sân BBQ và dịch vụ đưa đón theo yêu cầu.",
        priceFrom: 420000,
        capacity: 3,
        rating: 4.6,
        imageUrl: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "BBQ", "Xe đưa đón"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-ma-lo",
        ownerId: "u-owner-demo",
        name: "Glamping Mã Lộ",
        type: "Lều",
        location: "Mã Lộ, Tây Ninh",
        description: "Lều glamping có sân lửa trại, view núi và gói chụp ảnh bình minh.",
        priceFrom: 360000,
        capacity: 4,
        rating: 4.7,
        imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "BBQ", "Lửa trại", "Thân thiện thú cưng"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-toa-thanh",
        ownerId: "u-owner-demo-2",
        name: "Căn hộ gần Tòa Thánh",
        type: "Phòng",
        location: "Hòa Thành, Tây Ninh",
        description: "Căn hộ nhỏ gần trung tâm, thuận tiện đi Tòa Thánh và chợ đêm.",
        priceFrom: 390000,
        capacity: 3,
        rating: 4.5,
        imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Máy lạnh", "Máy giặt", "Gần trung tâm"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-trang-bang-family",
        ownerId: "u-owner-demo-2",
        name: "Nhà sân vườn Trảng Bàng",
        type: "Nhà nguyên căn",
        location: "Trảng Bàng, Tây Ninh",
        description: "Nhà nguyên căn rộng, có bếp lớn và sân cho trẻ em.",
        priceFrom: 780000,
        capacity: 8,
        rating: 4.9,
        imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Bếp", "Hồ bơi mini", "Bãi đậu xe"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-chau-thanh",
        ownerId: "u-owner-demo",
        name: "Farmstay Châu Thành",
        type: "Nhà nguyên căn",
        location: "Châu Thành, Tây Ninh",
        description: "Farmstay trải nghiệm vườn trái cây, nấu ăn cùng chủ nhà và đạp xe quanh làng.",
        priceFrom: 520000,
        capacity: 5,
        rating: 4.4,
        imageUrl: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Bếp", "Xe đạp", "Vườn trái cây"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-go-dau",
        ownerId: "u-owner-demo-2",
        name: "Bungalow Gò Dầu Riverside",
        type: "Phòng",
        location: "Gò Dầu, Tây Ninh",
        description: "Bungalow ven sông, hợp với khách nghỉ dưỡng ngắn ngày và làm việc từ xa.",
        priceFrom: 460000,
        capacity: 4,
        rating: 4.6,
        imageUrl: "https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "View sông", "Máy lạnh", "Cà phê sáng"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-tan-bien",
        ownerId: "u-owner-demo",
        name: "Nhà gỗ Tân Biên",
        type: "Nhà nguyên căn",
        location: "Tân Biên, Tây Ninh",
        description: "Nhà gỗ riêng tư gần rừng, có bếp ngoài trời và khu sinh hoạt chung.",
        priceFrom: 880000,
        capacity: 10,
        rating: 4.8,
        imageUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Bếp", "BBQ", "Sân vườn", "Bãi đậu xe"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-dau-tieng-cabin",
        ownerId: "u-owner-demo-2",
        name: "Cabin hồ Dầu Tiếng",
        type: "Phòng",
        location: "Hồ Dầu Tiếng, Tây Ninh",
        description: "Cabin nhỏ ven hồ, có ban công ngắm hoàng hôn và dịch vụ picnic.",
        priceFrom: 540000,
        capacity: 2,
        rating: 4.7,
        imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "View hồ", "Picnic", "Máy lạnh"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-moc-bai",
        ownerId: "u-owner-demo",
        name: "Transit Stay Mộc Bài",
        type: "Phòng",
        location: "Bến Cầu, Tây Ninh",
        description: "Lưu trú ngắn ngày gần Mộc Bài, có đưa đón và check-in linh hoạt.",
        priceFrom: 320000,
        capacity: 2,
        rating: 4.3,
        imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Đưa đón", "Check-in linh hoạt", "Máy lạnh"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-phuoc-dong",
        ownerId: "u-owner-demo-2",
        name: "Retreat Phước Đông",
        type: "Lều",
        location: "Phước Đông, Tây Ninh",
        description: "Khu retreat yên tĩnh với yoga sáng, lều lớn và bữa tối sân vườn.",
        priceFrom: 610000,
        capacity: 6,
        rating: 4.9,
        imageUrl: "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Yoga", "Lửa trại", "Bữa tối"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-city-loft",
        ownerId: "u-owner-demo",
        name: "City Loft Tây Ninh",
        type: "Phòng",
        location: "TP Tây Ninh",
        description: "Loft hiện đại ngay trung tâm, gần quán ăn và các điểm tham quan nội thành.",
        priceFrom: 500000,
        capacity: 3,
        rating: 4.5,
        imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Gần trung tâm", "Máy giặt", "Máy lạnh"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "hs-orchard-villa",
        ownerId: "u-owner-demo-2",
        name: "Orchard Villa Trảng Bàng",
        type: "Nhà nguyên căn",
        location: "Trảng Bàng, Tây Ninh",
        description: "Villa vườn cây có hồ bơi, phòng bếp rộng và khu tiệc ngoài trời.",
        priceFrom: 1250000,
        capacity: 12,
        rating: 4.9,
        imageUrl: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80",
        amenities: ["Wifi", "Hồ bơi", "Bếp", "BBQ", "Sân vườn"],
        createdAt: now,
        updatedAt: now
      }
    ];
    for (const homestay of homestays) {
      await this.redis.set(this.key("homestay", homestay.id), homestay);
      await this.redis.sadd("idx:homestays", homestay.id);
      await this.redis.sadd(this.key("owner_homestays", homestay.ownerId), homestay.id);
    }
    await this.redis.sadd(this.key("staff_assignments", "u-owner-staff-demo"), "hs-ba-den", "hs-ma-lo", "hs-trang-bang-family");
    await this.redis.sadd(this.key("staff_assignments", "u-manager-staff-demo"), "hs-ba-den", "hs-trang-bang", "hs-ma-lo", "hs-trang-bang-family");

    const rooms: RoomRecord[] = [
      { id: "room-demo-family", homestayId: "hs-ba-den", name: "Phòng gia đình", roomType: "Gia đình", pricePerNight: 650000, capacity: 6, totalUnits: 2, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-couple", homestayId: "hs-ba-den", name: "Phòng đôi view vườn", roomType: "Phòng đôi", pricePerNight: 480000, capacity: 2, totalUnits: 3, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-lake", homestayId: "hs-trang-bang", name: "Phòng ven hồ", roomType: "Phòng đôi", pricePerNight: 420000, capacity: 3, totalUnits: 2, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-lake-suite", homestayId: "hs-trang-bang", name: "Suite view hồ", roomType: "Suite", pricePerNight: 680000, capacity: 4, totalUnits: 1, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-glamp-1", homestayId: "hs-ma-lo", name: "Lều đôi sunrise", roomType: "Glamping", pricePerNight: 360000, capacity: 2, totalUnits: 6, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-glamp-2", homestayId: "hs-ma-lo", name: "Lều gia đình", roomType: "Glamping gia đình", pricePerNight: 590000, capacity: 4, totalUnits: 3, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-toa-thanh", homestayId: "hs-toa-thanh", name: "Studio trung tam", roomType: "Studio", pricePerNight: 390000, capacity: 3, totalUnits: 4, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-trang-bang-house", homestayId: "hs-trang-bang-family", name: "Nguyên căn 3 phòng ngủ", roomType: "Nhà nguyên căn", pricePerNight: 780000, capacity: 8, totalUnits: 1, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-farm", homestayId: "hs-chau-thanh", name: "Phòng vườn trái cây", roomType: "Garden", pricePerNight: 520000, capacity: 5, totalUnits: 2, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-go-dau", homestayId: "hs-go-dau", name: "Bungalow ven song", roomType: "Bungalow", pricePerNight: 460000, capacity: 4, totalUnits: 4, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-tan-bien-house", homestayId: "hs-tan-bien", name: "Nhà gỗ 4 phòng", roomType: "Nhà nguyên căn", pricePerNight: 880000, capacity: 10, totalUnits: 1, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-cabin-lake", homestayId: "hs-dau-tieng-cabin", name: "Cabin hoàng hôn", roomType: "Cabin", pricePerNight: 540000, capacity: 2, totalUnits: 5, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-moc-bai", homestayId: "hs-moc-bai", name: "Phòng transit", roomType: "Transit", pricePerNight: 320000, capacity: 2, totalUnits: 8, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-retreat", homestayId: "hs-phuoc-dong", name: "Lều retreat", roomType: "Lều retreat", pricePerNight: 610000, capacity: 6, totalUnits: 3, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-city-loft", homestayId: "hs-city-loft", name: "Loft trung tâm", roomType: "Loft", pricePerNight: 500000, capacity: 3, totalUnits: 6, active: true, createdAt: now, updatedAt: now },
      { id: "room-demo-orchard-villa", homestayId: "hs-orchard-villa", name: "Villa nguyên căn", roomType: "Villa", pricePerNight: 1250000, capacity: 12, totalUnits: 1, active: true, createdAt: now, updatedAt: now }
    ];
    const roomImages = [
      "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=85"
    ];
    for (const [index, seedRoom] of rooms.entries()) {
      const room = { ...seedRoom, imageUrl: seedRoom.imageUrl ?? roomImages[index % roomImages.length] };
      await this.redis.set(this.key("room", room.id), room);
      await this.redis.sadd(this.key("homestay_rooms", room.homestayId), room.id);
    }

    const services: ServiceRecord[] = [
      { id: "svc-demo-breakfast", homestayId: "hs-ba-den", name: "Bữa sáng địa phương", description: "Bánh canh Trảng Bàng và cà phê", unitPrice: 90000, included: false, active: true, createdAt: now },
      { id: "svc-demo-bbq", homestayId: "hs-ba-den", name: "Set BBQ sân vườn", description: "Set BBQ cho nhóm 4 người", unitPrice: 450000, included: false, active: true, createdAt: now },
      { id: "svc-demo-wifi", homestayId: "hs-ba-den", name: "Wifi tốc độ cao", unitPrice: 0, included: true, active: true, createdAt: now },
      { id: "svc-demo-shuttle", homestayId: "hs-trang-bang", name: "Xe đưa đón", unitPrice: 250000, included: false, active: true, createdAt: now },
      { id: "svc-demo-lake-kayak", homestayId: "hs-trang-bang", name: "Thuê kayak", unitPrice: 180000, included: false, active: true, createdAt: now },
      { id: "svc-demo-firewood", homestayId: "hs-ma-lo", name: "Set lửa trại", unitPrice: 220000, included: false, active: true, createdAt: now },
      { id: "svc-demo-photo", homestayId: "hs-ma-lo", name: "Gói chụp ảnh bình minh", unitPrice: 350000, included: false, active: true, createdAt: now },
      { id: "svc-demo-laundry", homestayId: "hs-toa-thanh", name: "Giặt sấy nhanh", unitPrice: 70000, included: false, active: true, createdAt: now },
      { id: "svc-demo-family-meal", homestayId: "hs-trang-bang-family", name: "Cơm nhà cho 6 người", unitPrice: 520000, included: false, active: true, createdAt: now },
      { id: "svc-demo-bike", homestayId: "hs-chau-thanh", name: "Thuê xe đạp", unitPrice: 60000, included: false, active: true, createdAt: now },
      { id: "svc-demo-fruit", homestayId: "hs-chau-thanh", name: "Giỏ trái cây tại vườn", unitPrice: 150000, included: false, active: true, createdAt: now },
      { id: "svc-demo-river-cafe", homestayId: "hs-go-dau", name: "Cà phê ven sông", unitPrice: 80000, included: false, active: true, createdAt: now },
      { id: "svc-demo-outdoor-kitchen", homestayId: "hs-tan-bien", name: "Bếp ngoài trời", unitPrice: 300000, included: false, active: true, createdAt: now },
      { id: "svc-demo-picnic", homestayId: "hs-dau-tieng-cabin", name: "Set picnic hoàng hôn", unitPrice: 260000, included: false, active: true, createdAt: now },
      { id: "svc-demo-transit", homestayId: "hs-moc-bai", name: "Đưa đón Mộc Bài", unitPrice: 180000, included: false, active: true, createdAt: now },
      { id: "svc-demo-yoga", homestayId: "hs-phuoc-dong", name: "Lớp yoga sáng", unitPrice: 120000, included: false, active: true, createdAt: now },
      { id: "svc-demo-city-food", homestayId: "hs-city-loft", name: "Tour ăn vặt nội thành", unitPrice: 220000, included: false, active: true, createdAt: now },
      { id: "svc-demo-pool-party", homestayId: "hs-orchard-villa", name: "Set tiệc hồ bơi", unitPrice: 850000, included: false, active: true, createdAt: now }
    ];
    for (const service of services) {
      await this.redis.set(this.key("service", service.id), service);
      await this.redis.sadd(this.key("homestay_services", service.homestayId), service.id);
    }

    const tayNinhGallery = [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=85"
    ];
    const images: HomestayImageRecord[] = homestays.flatMap((homestay, index) => [
      { id: `img-${homestay.id}-main`, homestayId: homestay.id, url: homestay.imageUrl, alt: homestay.name, position: 0, createdAt: now },
      ...Array.from({ length: 4 }, (_, offset) => ({
        id: `img-${homestay.id}-${offset + 1}`,
        homestayId: homestay.id,
        url: tayNinhGallery[(index + offset) % tayNinhGallery.length],
        alt: `${homestay.name} - góc ${offset + 1}`,
        position: offset + 1,
        createdAt: now
      }))
    ]);
    for (const image of images) {
      await this.redis.set(this.key("homestay_image", image.id), image);
      await this.redis.sadd(this.key("homestay_images", image.homestayId), image.id);
    }

    const rates: RoomRateRecord[] = [
      { id: "rate-family-summer", roomId: "room-demo-family", startDate: "2030-06-01", endDate: "2030-08-31", pricePerNight: 720000, createdAt: now },
      { id: "rate-lake-holiday", roomId: "room-demo-lake-suite", startDate: "2030-06-01", endDate: "2030-08-31", pricePerNight: 760000, createdAt: now },
      { id: "rate-house-weekend", roomId: "room-demo-trang-bang-house", startDate: "2030-01-01", endDate: "2030-12-31", pricePerNight: 860000, createdAt: now }
    ];
    for (const rate of rates) {
      await this.redis.set(this.key("room_rate", rate.id), rate);
      await this.redis.sadd(this.key("room_rates", rate.roomId), rate.id);
    }

    const reviews: Review[] = [
      { id: "rv-ba-den-1", userId: "u-customer-demo", rating: 5, comment: "Phòng sạch, gần núi và chủ nhà hướng dẫn rất kỹ." },
      { id: "rv-lake-1", userId: "u-customer-demo", rating: 4, comment: "View hồ đẹp, hợp nghỉ cuối tuần." },
      { id: "rv-glamp-1", userId: "u-customer-demo", rating: 5, comment: "Lửa trại và bình minh rất đáng tiền." }
    ];
    const reviewHomestays = ["hs-ba-den", "hs-trang-bang", "hs-ma-lo"];
    for (const [index, review] of reviews.entries()) {
      await this.redis.set(this.key("review", review.id), review);
      await this.redis.sadd(this.key("homestay_reviews", reviewHomestays[index]), review.id);
    }

    await this.ensureCustomerDemoBookings(await this.requireUser("u-customer-demo"));

    const articles: ArticleRecord[] = [
      {
        id: "art-demo-guide",
        authorId: "u-staff-demo",
        title: "Gợi ý lịch trình Tây Ninh 2 ngày",
        slug: "lich-trinh-tay-ninh-2-ngay",
        imageUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Tham quan núi Bà Đen, tòa thánh và thưởng thức đặc sản địa phương.",
        content: "Lịch trình gợi ý cho khách lưu trú homestay tại Tây Ninh.",
        status: "PUBLISHED",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "art-demo-food",
        authorId: "u-staff-demo",
        title: "Món ngon nên thử khi đến Tây Ninh",
        slug: "mon-ngon-tay-ninh",
        imageUrl: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Bánh tráng phơi sương, bò tơ và muối tôm là các điểm nhấn ẩm thực.",
        content: "Danh sách gợi ý món ngon và cách sắp xếp lịch ăn uống trong chuyến đi.",
        status: "PUBLISHED",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "art-demo-ba-den",
        authorId: "u-content-staff-demo",
        title: "Săn mây núi Bà Đen và những khung giờ đẹp",
        slug: "san-may-nui-ba-den",
        imageUrl: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Gợi ý thời điểm lên núi, chuẩn bị áo khoác và cách kết hợp lưu trú homestay gần chân núi.",
        content: "Buổi sáng sớm và chiều muộn là hai khung giờ dễ có ánh sáng đẹp quanh núi Bà Đen. Du khách nên chuẩn bị áo khoác mỏng, nước uống và đặt homestay gần khu Thạnh Tân để di chuyển thuận tiện.",
        status: "PUBLISHED",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "art-demo-dau-tieng",
        authorId: "u-content-staff-demo",
        title: "Cuối tuần bên hồ Dầu Tiếng",
        slug: "cuoi-tuan-ho-dau-tieng",
        imageUrl: "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Lịch trình nhẹ nhàng cho nhóm bạn: ngắm hoàng hôn, BBQ sân vườn và ngủ cabin ven hồ.",
        content: "Hồ Dầu Tiếng hợp với chuyến nghỉ 2 ngày 1 đêm. Ngày đầu nhận phòng, chuẩn bị BBQ và ngắm hoàng hôn. Sáng hôm sau có thể chèo kayak hoặc dạo quanh cung đường ven hồ.",
        status: "PUBLISHED",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "art-demo-toa-thanh",
        authorId: "u-staff-demo",
        title: "Đi Tòa Thánh Cao Đài trong nửa ngày",
        slug: "toa-thanh-cao-dai-nua-ngay",
        imageUrl: "https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Các lưu ý về trang phục, giờ tham quan và cách ghép lịch với bữa trưa đặc sản.",
        content: "Khi tham quan Tòa Thánh Cao Đài, du khách nên chọn trang phục lịch sự và giữ trật tự trong khu vực hành lễ. Lịch trình nửa ngày có thể kết hợp ăn bánh canh Trảng Bàng hoặc bò tơ Tây Ninh.",
        status: "PUBLISHED",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "art-demo-draft",
        authorId: "u-staff-demo",
        title: "Bản nháp cẩm nang owner",
        slug: "ban-nhap-cam-nang-owner",
        imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=85",
        excerpt: "Bản nháp để staff kiểm tra thao tác CMS.",
        content: "Nội dung nháp.",
        status: "DRAFT",
        createdAt: now,
        updatedAt: now
      }
    ];
    await Promise.all(articles.map((article) => this.saveArticle(article)));
    const report: ReportRecord = {
      id: "report-demo-open",
      reporterId: "u-customer-demo",
      reportedUserId: "u-owner-demo",
      reason: "Cần kiểm tra nội dung mô tả homestay",
      status: "OPEN",
      createdAt: now
    };
    await this.redis.set(this.key("report", report.id), report);
    await this.redis.sadd("idx:reports", report.id);
  }

  private async upsertDemoUser(seed: UserRecord) {
    const existingId = await this.redis.get<string>(this.key("user_email", seed.email));
    const existing = existingId ? await this.get<UserRecord>("user", existingId) : undefined;
    if (existing) {
      await this.saveUser({
        ...seed,
        id: existing.id,
        role: existing.role,
        banned: existing.banned,
        authLinked: existing.authLinked,
        passwordHash: seed.passwordHash ?? existing.passwordHash,
        googleSub: existing.googleSub,
        createdAt: existing.createdAt,
        updatedAt: this.now()
      });
      return;
    }
    await this.saveUser(seed);
  }

  private async ensureCustomerDemoBookings(customer: UserRecord) {
    if (customer.role !== "CUSTOMER") return;
    const suffix = customer.id.replace(/[^a-zA-Z0-9-]/g, "-");
    const now = this.now();
    const templates: Array<{
      id: string;
      homestayId: string;
      roomId: string;
      guestCount: number;
      checkIn: string;
      checkOut: string;
      status: BookingStatus;
      roomTotal: number;
      service?: { id: string; name: string; quantity: number; unitPrice: number; status: BookingService["status"] };
      paymentStatus: Payment["status"];
    }> = [
      { id: `bk-demo-${suffix}-pending`, homestayId: "hs-trang-bang", roomId: "room-demo-lake", guestCount: 2, checkIn: "2030-05-10", checkOut: "2030-05-12", status: "PENDING", roomTotal: 840000, service: { id: "svc-demo-shuttle", name: "Xe đưa đón", quantity: 1, unitPrice: 250000, status: "PREPARING" }, paymentStatus: "INITIATED" },
      { id: `bk-demo-${suffix}-confirmed`, homestayId: "hs-ma-lo", roomId: "room-demo-glamp-2", guestCount: 4, checkIn: "2030-06-18", checkOut: "2030-06-20", status: "CONFIRMED", roomTotal: 1180000, service: { id: "svc-demo-firewood", name: "Set lửa trại", quantity: 1, unitPrice: 220000, status: "PREPARING" }, paymentStatus: "PAID" },
      { id: `bk-demo-${suffix}-in-stay`, homestayId: "hs-ba-den", roomId: "room-demo-family", guestCount: 2, checkIn: "2030-07-01", checkOut: "2030-07-03", status: "IN_STAY", roomTotal: 1300000, service: { id: "svc-demo-bbq", name: "Set BBQ sân vườn", quantity: 1, unitPrice: 450000, status: "PREPARING" }, paymentStatus: "PENDING" },
      { id: `bk-demo-${suffix}-completed`, homestayId: "hs-chau-thanh", roomId: "room-demo-farm", guestCount: 3, checkIn: "2030-04-01", checkOut: "2030-04-02", status: "COMPLETED", roomTotal: 520000, service: { id: "svc-demo-fruit", name: "Giỏ trái cây tại vườn", quantity: 1, unitPrice: 150000, status: "SERVED" }, paymentStatus: "PAID" },
      { id: `bk-demo-${suffix}-cancelled`, homestayId: "hs-toa-thanh", roomId: "room-demo-toa-thanh", guestCount: 2, checkIn: "2030-03-01", checkOut: "2030-03-03", status: "CANCELLED", roomTotal: 780000, paymentStatus: "CANCELLED" }
    ];
    for (const item of templates) {
      if (await this.redis.exists(this.key("booking", item.id))) {
        await this.ensureDemoPaymentQr(item.id);
        continue;
      }
      const serviceTotal = item.service ? item.service.quantity * item.service.unitPrice : 0;
      const taxTotal = Math.round((item.roomTotal + serviceTotal) * 0.1);
      const booking: BookingRecord = {
        id: item.id,
        customerId: customer.id,
        homestayId: item.homestayId,
        roomId: item.roomId,
        guestName: customer.name,
        guestPhone: customer.phone ?? "0901000001",
        guestCount: item.guestCount,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        status: item.status,
        roomTotal: item.roomTotal,
        serviceTotal,
        taxTotal,
        grandTotal: item.roomTotal + serviceTotal + taxTotal,
        createdAt: now
      };
      await this.redis.set(this.key("booking", booking.id), booking);
      await this.redis.sadd("idx:bookings", booking.id);
      await this.redis.sadd(this.key("customer_bookings", booking.customerId), booking.id);
      if (item.service) {
        await this.saveBookingService({
          id: `bs-${item.id}`,
          bookingId: booking.id,
          serviceId: item.service.id,
          name: item.service.name,
          quantity: item.service.quantity,
          unitPrice: item.service.unitPrice,
          total: serviceTotal,
          status: item.service.status
        });
      }
      await this.savePayment({
        id: `pay-${item.id}`,
        bookingId: booking.id,
        provider: "mock-apipay",
        providerRef: `mock-${item.id}`,
        status: item.paymentStatus,
        amount: booking.grandTotal,
        checkoutUrl: item.paymentStatus === "PAID" || item.paymentStatus === "CANCELLED" ? undefined : `https://pay.example.local/${item.id}`,
        qrUrl: item.paymentStatus === "PAID" || item.paymentStatus === "CANCELLED" ? undefined : this.demoQrUrl(`https://pay.example.local/${item.id}`)
      });
    }
  }

  private async ensureDemoPaymentQr(bookingId: string) {
    const payment = await this.redis.get<Payment>(this.key("payment_booking", bookingId));
    if (!payment || payment.status === "PAID" || payment.status === "CANCELLED" || payment.qrUrl) return;
    const paymentLink = payment.checkoutUrl || `https://pay.example.local/${bookingId}`;
    await this.savePayment({ ...payment, checkoutUrl: payment.checkoutUrl ?? paymentLink, qrUrl: this.demoQrUrl(paymentLink) });
  }

  private demoQrUrl(value: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(value)}`;
  }
}
