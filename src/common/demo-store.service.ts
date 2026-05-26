import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Article, Booking, BookingService, BookingStatus, DemoUser, Homestay, Payment, Service, UserRole, ViolationReport } from "./domain";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class DemoStoreService {
  readonly users: DemoUser[] = [
    { id: "u-customer", name: "Minh Anh", email: "customer@homestay.vn", phone: "0901000001", role: "CUSTOMER", banned: false },
    { id: "u-owner", name: "Chu Homestay", email: "owner@homestay.vn", phone: "0901000002", role: "OWNER", banned: false },
    { id: "u-owner-staff", name: "Nhan Vien Homestay", email: "staff-owner@homestay.vn", phone: "0901000003", role: "OWNER_STAFF", banned: false },
    { id: "u-staff", name: "Content Staff", email: "staff@homestay.vn", role: "STAFF", banned: false },
    { id: "u-admin", name: "System Admin", email: "admin@homestay.vn", role: "ADMIN", banned: false }
  ];

  readonly homestays: Homestay[] = [
    {
      id: "hs-ba-den",
      ownerId: "u-owner",
      name: "Terra Leaf Nui Ba",
      type: "Nha nguyen can",
      location: "Gan nui Ba Den, Tay Ninh",
      description: "Can nha vuon am cung voi view nui, bep rieng va san BBQ cho nhom ban hoac gia dinh.",
      priceFrom: 1450000,
      capacity: 8,
      rating: 4.8,
      imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
      amenities: ["Wifi", "Bep rieng", "San BBQ", "May lanh", "Bai dau xe"],
      rooms: [
        { id: "room-ba-den-family", homestayId: "hs-ba-den", name: "Family Garden House", roomType: "Nha nguyen can", pricePerNight: 1450000, capacity: 8, totalUnits: 1, active: true }
      ],
      includedServices: [
        { id: "svc-breakfast", homestayId: "hs-ba-den", name: "Bua sang", unitPrice: 0, included: true, active: true },
        { id: "svc-wifi", homestayId: "hs-ba-den", name: "Wifi", unitPrice: 0, included: true, active: true }
      ],
      services: [
        { id: "svc-bbq", homestayId: "hs-ba-den", name: "Tiec BBQ san vuon", description: "Set BBQ cho 4 nguoi", unitPrice: 650000, included: false, active: true },
        { id: "svc-trekking", homestayId: "hs-ba-den", name: "Tour trekking", description: "Huong dan vien nua ngay", unitPrice: 450000, included: false, active: true }
      ],
      reviews: [
        { id: "rev-1", userId: "u-customer", rating: 5, comment: "Khong gian dep, gan nui, nhan vien ho tro nhanh." }
      ]
    },
    {
      id: "hs-trang-bang",
      ownerId: "u-owner",
      name: "Soft Sand Trang Bang",
      type: "Phong",
      location: "Trang Bang, Tay Ninh",
      description: "Phong rieng phong cach toi gian, phu hop cap doi va khach cong tac ngan ngay.",
      priceFrom: 690000,
      capacity: 2,
      rating: 4.6,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
      amenities: ["Wifi", "May lanh", "An sang", "Giu hanh ly"],
      rooms: [
        { id: "room-trang-bang-deluxe", homestayId: "hs-trang-bang", name: "Deluxe Soft Sand", roomType: "Phong", pricePerNight: 690000, capacity: 2, totalUnits: 6, active: true }
      ],
      includedServices: [
        { id: "svc-welcome", homestayId: "hs-trang-bang", name: "Nuoc chao mung", unitPrice: 0, included: true, active: true }
      ],
      services: [
        { id: "svc-bike", homestayId: "hs-trang-bang", name: "Thue xe may", unitPrice: 180000, included: false, active: true },
        { id: "svc-water", homestayId: "hs-trang-bang", name: "Nuoc uong them", unitPrice: 20000, included: false, active: true }
      ],
      reviews: [
        { id: "rev-2", userId: "u-customer", rating: 4, comment: "Sach se, tien di chuyen." }
      ]
    }
  ];

  readonly bookings: Booking[] = [
    {
      id: "bk-demo-1",
      customerId: "u-customer",
      homestayId: "hs-ba-den",
      roomId: "room-ba-den-family",
      guestName: "Minh Anh",
      guestPhone: "0901000001",
      guestCount: 4,
      checkIn: "2026-05-28",
      checkOut: "2026-05-30",
      status: "IN_STAY",
      roomTotal: 2900000,
      serviceTotal: 650000,
      taxTotal: 0,
      grandTotal: 3550000,
      createdAt: now(),
      services: [
        { id: "bs-demo-1", bookingId: "bk-demo-1", serviceId: "svc-bbq", name: "Tiec BBQ san vuon", quantity: 1, unitPrice: 650000, total: 650000, status: "PREPARING" }
      ],
      payment: {
        id: "pay-demo-1",
        bookingId: "bk-demo-1",
        provider: "mock-apipay",
        providerRef: "mock_bk_demo_1",
        status: "PAID",
        amount: 3550000,
        checkoutUrl: "/bookings"
      }
    }
  ];

  readonly articles: Article[] = [
    {
      id: "art-1",
      authorId: "u-staff",
      title: "48 gio kham pha Tay Ninh",
      slug: "48-gio-kham-pha-tay-ninh",
      excerpt: "Lich trinh gan nui Ba Den, mon an dia phuong va homestay gan thien nhien.",
      content: "Goi y lich trinh 2 ngay 1 dem cho khach lan dau den Tay Ninh.",
      status: "PUBLISHED"
    }
  ];

  readonly reports: ViolationReport[] = [
    {
      id: "report-1",
      reporterId: "u-customer",
      reportedUserId: "u-customer",
      reason: "Spam bình luận trong bài viết du lịch",
      status: "OPEN",
      createdAt: now()
    },
    {
      id: "report-2",
      reporterId: "u-owner",
      reportedUserId: "u-customer",
      reason: "Nghi ngờ đánh giá giả mạo homestay",
      status: "OPEN",
      createdAt: now()
    }
  ];

  searchHomestays(query: Record<string, string | undefined>) {
    const cached = this.homestays.filter((homestay) => {
      if (query.type && homestay.type !== query.type) return false;
      if (query.guests && homestay.capacity < Number(query.guests)) return false;
      if (query.maxPrice && homestay.priceFrom > Number(query.maxPrice)) return false;
      return true;
    });
    return cached;
  }

  getHomestay(idValue: string) {
    const homestay = this.homestays.find((item) => item.id === idValue);
    if (!homestay) throw new NotFoundException("Homestay not found");
    return homestay;
  }

  getBooking(bookingId: string) {
    const booking = this.bookings.find((item) => item.id === bookingId);
    if (!booking) throw new NotFoundException("Booking not found");
    return booking;
  }

  createRoom(homestayId: string, input: Partial<Homestay["rooms"][number]>) {
    const homestay = this.getHomestay(homestayId);
    const room = {
      id: id("room"),
      homestayId,
      name: String(input.name ?? "Phong moi"),
      roomType: String(input.roomType ?? homestay.type),
      pricePerNight: Number(input.pricePerNight ?? homestay.priceFrom),
      capacity: Number(input.capacity ?? 2),
      totalUnits: Number(input.totalUnits ?? 1),
      active: input.active ?? true
    };
    homestay.rooms.push(room);
    homestay.priceFrom = Math.min(homestay.priceFrom, room.pricePerNight);
    homestay.capacity = Math.max(homestay.capacity, room.capacity);
    return room;
  }

  updateRoom(homestayId: string, roomId: string, input: Partial<Homestay["rooms"][number]>) {
    const homestay = this.getHomestay(homestayId);
    const room = homestay.rooms.find((item) => item.id === roomId);
    if (!room) throw new NotFoundException("Room not found");
    Object.assign(room, {
      ...input,
      pricePerNight: input.pricePerNight === undefined ? room.pricePerNight : Number(input.pricePerNight),
      capacity: input.capacity === undefined ? room.capacity : Number(input.capacity),
      totalUnits: input.totalUnits === undefined ? room.totalUnits : Number(input.totalUnits)
    });
    return room;
  }

  createService(homestayId: string, input: Partial<Service>) {
    const homestay = this.getHomestay(homestayId);
    const service: Service = {
      id: id("svc"),
      homestayId,
      name: String(input.name ?? "Dich vu moi"),
      description: input.description,
      unitPrice: Number(input.unitPrice ?? 0),
      included: Boolean(input.included ?? false),
      active: input.active ?? true
    };
    if (service.included) homestay.includedServices.push(service);
    else homestay.services.push(service);
    return service;
  }

  updateService(homestayId: string, serviceId: string, input: Partial<Service>) {
    const homestay = this.getHomestay(homestayId);
    const allServices = [...homestay.includedServices, ...homestay.services];
    const service = allServices.find((item) => item.id === serviceId);
    if (!service) throw new NotFoundException("Service not found");
    Object.assign(service, {
      ...input,
      unitPrice: input.unitPrice === undefined ? service.unitPrice : Number(input.unitPrice)
    });
    return service;
  }

  updateHomestay(homestayId: string, input: Partial<Homestay>) {
    const homestay = this.getHomestay(homestayId);
    Object.assign(homestay, {
      ...input,
      priceFrom: input.priceFrom === undefined ? homestay.priceFrom : Number(input.priceFrom),
      capacity: input.capacity === undefined ? homestay.capacity : Number(input.capacity)
    });
    return homestay;
  }

  createBooking(input: Partial<Booking> & { serviceItems?: Array<{ serviceId: string; quantity: number }> }) {
    const homestay = this.getHomestay(String(input.homestayId));
    const room = homestay.rooms.find((item) => item.id === input.roomId) ?? homestay.rooms[0];
    const nights = this.nights(String(input.checkIn), String(input.checkOut));
    const services = this.createBookingServices("pending", homestay.services, input.serviceItems ?? []);
    const roomTotal = room.pricePerNight * nights;
    const serviceTotal = services.reduce((sum, item) => sum + item.total, 0);
    const bookingId = id("bk");
    const booking: Booking = {
      id: bookingId,
      customerId: String(input.customerId ?? "u-customer"),
      homestayId: homestay.id,
      roomId: room.id,
      guestName: String(input.guestName ?? "Demo Guest"),
      guestPhone: String(input.guestPhone ?? "0900000000"),
      guestCount: Number(input.guestCount ?? 1),
      checkIn: String(input.checkIn),
      checkOut: String(input.checkOut),
      status: "PENDING",
      roomTotal,
      serviceTotal,
      taxTotal: 0,
      grandTotal: roomTotal + serviceTotal,
      proxyCreatedBy: input.proxyCreatedBy,
      services: services.map((service) => ({ ...service, bookingId })),
      createdAt: now()
    };
    this.bookings.unshift(booking);
    return booking;
  }

  addServiceToBooking(bookingId: string, serviceId: string, quantity = 1) {
    const booking = this.getBooking(bookingId);
    if (booking.status !== "IN_STAY") {
      throw new BadRequestException("Add-on service is only available while booking is IN_STAY");
    }
    const homestay = this.getHomestay(booking.homestayId);
    const service = homestay.services.find((item) => item.id === serviceId);
    if (!service) throw new NotFoundException("Service not found");
    const bookingService: BookingService = {
      id: id("bs"),
      bookingId,
      serviceId,
      name: service.name,
      quantity,
      unitPrice: service.unitPrice,
      total: service.unitPrice * quantity,
      status: "PREPARING"
    };
    booking.services.push(bookingService);
    booking.serviceTotal += bookingService.total;
    booking.grandTotal += bookingService.total;
    booking.payment && (booking.payment.amount = booking.grandTotal);
    return booking;
  }

  updateBookingStatus(bookingId: string, status: BookingStatus) {
    const booking = this.getBooking(bookingId);
    const allowed: Record<BookingStatus, BookingStatus[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["IN_STAY", "CANCELLED"],
      IN_STAY: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: []
    };
    if (!allowed[booking.status].includes(status)) {
      throw new BadRequestException(`Cannot change booking from ${booking.status} to ${status}`);
    }
    booking.status = status;
    return booking;
  }

  upsertPayment(bookingId: string, payment: Omit<Payment, "id" | "bookingId">) {
    const booking = this.getBooking(bookingId);
    booking.payment = {
      id: booking.payment?.id ?? id("pay"),
      bookingId,
      ...payment
    };
    return booking.payment;
  }

  setServiceOrderStatus(bookingId: string, bookingServiceId: string, status: BookingService["status"]) {
    const booking = this.getBooking(bookingId);
    const service = booking.services.find((item) => item.id === bookingServiceId);
    if (!service) throw new NotFoundException("Booking service not found");
    service.status = status;
    return service;
  }

  metrics() {
    const revenue = this.bookings.reduce((sum, item) => sum + (item.payment?.status === "PAID" ? item.grandTotal : 0), 0);
    const completed = this.bookings.filter((item) => item.status === "COMPLETED").length;
    return {
      transactions: this.bookings.length,
      revenue,
      occupancyRate: 68,
      completed,
      homestayPerformance: this.homestays.map((homestay) => ({
        homestayId: homestay.id,
        name: homestay.name,
        bookings: this.bookings.filter((booking) => booking.homestayId === homestay.id).length
      }))
    };
  }

  banUser(userId: string, banned = true) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new NotFoundException("User not found");
    user.banned = banned;
    return user;
  }

  createUser(input: { name?: string; email?: string; phone?: string; role?: UserRole }) {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Email is required");
    if (this.users.some((user) => user.email.toLowerCase() === email)) {
      throw new BadRequestException("Email already exists");
    }
    const allowedRoles: UserRole[] = ["CUSTOMER", "OWNER", "OWNER_STAFF", "STAFF", "ADMIN"];
    const role = allowedRoles.includes(input.role as UserRole) ? (input.role as UserRole) : "CUSTOMER";
    const user: DemoUser = {
      id: id("u"),
      name: String(input.name ?? email.split("@")[0]),
      email,
      phone: input.phone,
      role,
      banned: false
    };
    this.users.unshift(user);
    return user;
  }

  setRole(userId: string, role: UserRole) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new NotFoundException("User not found");
    user.role = role;
    return user;
  }

  createArticle(input: Partial<Article>) {
    const article: Article = {
      id: id("art"),
      authorId: input.authorId ?? "u-staff",
      title: String(input.title ?? "Bai viet moi"),
      slug: String(input.slug ?? id("article")),
      excerpt: String(input.excerpt ?? ""),
      content: String(input.content ?? ""),
      status: input.status ?? "DRAFT"
    };
    this.articles.unshift(article);
    return article;
  }

  updateArticle(articleId: string, input: Partial<Article>) {
    const article = this.articles.find((item) => item.id === articleId);
    if (!article) throw new NotFoundException("Article not found");
    Object.assign(article, input);
    return article;
  }

  deleteArticle(articleId: string) {
    const index = this.articles.findIndex((item) => item.id === articleId);
    if (index === -1) throw new NotFoundException("Article not found");
    const [article] = this.articles.splice(index, 1);
    return article;
  }

  setArticleStatus(articleId: string, status: Article["status"]) {
    return this.updateArticle(articleId, { status });
  }

  resolveReport(reportId: string) {
    const report = this.reports.find((item) => item.id === reportId);
    if (!report) throw new NotFoundException("Violation report not found");
    report.status = "RESOLVED";
    return report;
  }

  private createBookingServices(bookingId: string, services: Service[], items: Array<{ serviceId: string; quantity: number }>) {
    return items.map((item) => {
      const service = services.find((candidate) => candidate.id === item.serviceId);
      if (!service) throw new NotFoundException(`Service ${item.serviceId} not found`);
      return {
        id: id("bs"),
        bookingId,
        serviceId: service.id,
        name: service.name,
        quantity: item.quantity,
        unitPrice: service.unitPrice,
        total: service.unitPrice * item.quantity,
        status: "PREPARING" as const
      };
    });
  }

  private nights(checkIn: string, checkOut: string) {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  }
}
