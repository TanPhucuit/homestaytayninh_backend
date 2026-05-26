import {
  ArticleStatus,
  BookingStatus,
  PaymentStatus,
  PrismaClient,
  ServiceOrderStatus,
  UserRole,
  ViolationReportStatus
} from "@prisma/client";

const prisma = new PrismaClient();

function assertSeedTarget() {
  if (process.env.ALLOW_PRESENTATION_SEED !== "true") {
    throw new Error("Refusing presentation seed without ALLOW_PRESENTATION_SEED=true.");
  }

  const target = process.env.PRESENTATION_SEED_TARGET;
  if (target !== "test" && target !== "production") {
    throw new Error("PRESENTATION_SEED_TARGET must be either test or production.");
  }

  if (target === "production" && process.env.ALLOW_PRODUCTION_DEMO_UPSERT !== "true") {
    throw new Error("Refusing production presentation seed without ALLOW_PRODUCTION_DEMO_UPSERT=true.");
  }
}

async function upsertPresentationProfile(profile: { id: string; name: string; email: string; phone?: string; role: UserRole }) {
  await prisma.userProfile.upsert({
    where: { id: profile.id },
    // Do not overwrite role/authId/banned for an existing profile. Real authorization must remain owned by user_profiles.
    update: { name: profile.name, phone: profile.phone },
    create: { ...profile, banned: false }
  });
}

async function main() {
  assertSeedTarget();

  await Promise.all([
    upsertPresentationProfile({ id: "u-customer", name: "Minh Anh", email: "customer@homestay.vn", phone: "0901000001", role: UserRole.CUSTOMER }),
    upsertPresentationProfile({ id: "u-owner", name: "Chủ Homestay", email: "owner@homestay.vn", phone: "0901000002", role: UserRole.OWNER }),
    upsertPresentationProfile({ id: "u-owner-staff", name: "Nhân viên Homestay", email: "owner.staff@homestay.vn", phone: "0901000003", role: UserRole.OWNER_STAFF }),
    upsertPresentationProfile({ id: "u-staff", name: "Nhân viên nội dung", email: "staff@homestay.vn", phone: "0901000004", role: UserRole.STAFF }),
    upsertPresentationProfile({ id: "u-admin", name: "Quản trị viên", email: "admin@homestay.vn", phone: "0901000005", role: UserRole.ADMIN })
  ]);

  const homestays = [
    {
      id: "hs-ba-den",
      name: "Terra Leaf Núi Bà",
      type: "Nhà nguyên căn",
      location: "Gần Núi Bà Đen, Tây Ninh",
      description: "Căn nhà vườn ấm cúng với view núi, bếp riêng, sân BBQ và khoảng hiên rộng cho nhóm bạn hoặc gia đình.",
      priceFrom: 1450000,
      capacity: 8,
      rating: 4.9,
      imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85"
    },
    {
      id: "hs-ma-loi",
      name: "Mã Lòi Forest Retreat",
      type: "Lều",
      location: "Dương Minh Châu, Tây Ninh",
      description: "Khu glamping sát mảng xanh hồ Dầu Tiếng, có lều canvas, bếp lửa tối và trekking nhẹ.",
      priceFrom: 980000,
      capacity: 4,
      rating: 4.7,
      imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85"
    },
    {
      id: "hs-trang-bang",
      name: "Soft Sand Trảng Bàng",
      type: "Phòng",
      location: "Trảng Bàng, Tây Ninh",
      description: "Phòng nghỉ sáng màu gần làng nghề bánh tráng, phù hợp chuyến đi cuối tuần và nhóm nhỏ.",
      priceFrom: 720000,
      capacity: 3,
      rating: 4.6,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=85"
    }
  ];

  for (const homestay of homestays) {
    await prisma.homestay.upsert({
      where: { id: homestay.id },
      update: homestay,
      create: { ...homestay, ownerId: "u-owner" }
    });
    await prisma.ownerStaffAssignment.upsert({
      where: { homestayId_staffId: { homestayId: homestay.id, staffId: "u-owner-staff" } },
      update: {},
      create: { homestayId: homestay.id, staffId: "u-owner-staff" }
    });
  }

  const rooms = [
    ["room-ba-den-family", "hs-ba-den", "Family Garden House", "Nhà nguyên căn", 1450000, 8, 1],
    ["room-ba-den-pine", "hs-ba-den", "Pine View Suite", "Phòng", 920000, 3, 2],
    ["room-ma-loi-canvas", "hs-ma-loi", "Canvas Tent Lake View", "Lều", 980000, 4, 4],
    ["room-trang-bang-deluxe", "hs-trang-bang", "Deluxe Garden Room", "Phòng", 720000, 3, 3]
  ] as const;

  for (const [id, homestayId, name, roomType, pricePerNight, capacity, totalUnits] of rooms) {
    await prisma.room.upsert({
      where: { id },
      update: { name, roomType, pricePerNight, capacity, totalUnits, active: true },
      create: { id, homestayId, name, roomType, pricePerNight, capacity, totalUnits, active: true }
    });
  }

  await Promise.all([
    prisma.roomRate.upsert({
      where: { id: "00000000-0000-4000-8000-000000000101" },
      update: { pricePerNight: 1650000 },
      create: { id: "00000000-0000-4000-8000-000000000101", roomId: "room-ba-den-family", startDate: new Date("2026-06-01"), endDate: new Date("2026-08-31"), pricePerNight: 1650000 }
    }),
    prisma.roomRate.upsert({
      where: { id: "00000000-0000-4000-8000-000000000102" },
      update: { pricePerNight: 1100000 },
      create: { id: "00000000-0000-4000-8000-000000000102", roomId: "room-ma-loi-canvas", startDate: new Date("2026-06-01"), endDate: new Date("2026-08-31"), pricePerNight: 1100000 }
    })
  ]);

  for (const [id, homestayId, url, alt, position] of [
    ["00000000-0000-4000-8000-000000000201", "hs-ba-den", homestays[0].imageUrl, "Không gian Terra Leaf Núi Bà", 1],
    ["00000000-0000-4000-8000-000000000202", "hs-ma-loi", homestays[1].imageUrl, "Lều Mã Lòi Forest Retreat", 1],
    ["00000000-0000-4000-8000-000000000203", "hs-trang-bang", homestays[2].imageUrl, "Phòng Soft Sand Trảng Bàng", 1]
  ] as const) {
    await prisma.homestayImage.upsert({
      where: { id },
      update: { url, alt, position },
      create: { id, homestayId, url, alt, position }
    });
  }

  for (const [id, homestayId, name] of [
    ["00000000-0000-4000-8000-000000000301", "hs-ba-den", "Wifi"],
    ["00000000-0000-4000-8000-000000000302", "hs-ba-den", "Sân BBQ"],
    ["00000000-0000-4000-8000-000000000303", "hs-ba-den", "View núi"],
    ["00000000-0000-4000-8000-000000000304", "hs-ma-loi", "Lửa trại"],
    ["00000000-0000-4000-8000-000000000305", "hs-ma-loi", "Trekking"],
    ["00000000-0000-4000-8000-000000000306", "hs-trang-bang", "Bãi đậu xe"]
  ] as const) {
    await prisma.amenity.upsert({
      where: { homestayId_name: { homestayId, name } },
      update: {},
      create: { id, homestayId, name }
    });
  }

  const services = [
    ["svc-breakfast", "hs-ba-den", "Bữa sáng bản địa", "Phục vụ 7:00 - 9:30 hằng ngày", 0, true],
    ["svc-wifi", "hs-ba-den", "Wifi tốc độ cao", "Bao gồm trong giá phòng", 0, true],
    ["svc-bbq", "hs-ba-den", "Tiệc BBQ sân vườn", "Set BBQ cho 4 người", 650000, false],
    ["svc-bike-ba-den", "hs-ba-den", "Thuê xe máy", "Xe số theo ngày", 180000, false],
    ["svc-ma-loi-fire", "hs-ma-loi", "Lửa trại tối", "Chuẩn bị củi, bếp lửa và ghế ngoài trời", 280000, false],
    ["svc-ma-loi-breakfast", "hs-ma-loi", "Bữa sáng glamping", "Bánh mì, trứng, cà phê và trái cây", 0, true],
    ["svc-trang-bang-food", "hs-trang-bang", "Tour ẩm thực Trảng Bàng", "Gợi ý và đặt bàn món địa phương", 300000, false]
  ] as const;

  for (const [id, homestayId, name, description, unitPrice, included] of services) {
    await prisma.service.upsert({
      where: { id },
      update: { name, description, unitPrice, included, active: true },
      create: { id, homestayId, name, description, unitPrice, included, active: true }
    });
  }

  const bookings = [
    ["bk-demo-1", "hs-ba-den", "room-ba-den-family", "Minh Anh", "0901000001", 4, "2026-05-25", "2026-05-27", BookingStatus.IN_STAY, 2900000, 650000, 355000, 3905000, null],
    ["bk-pending-1", "hs-ma-loi", "room-ma-loi-canvas", "Minh Anh", "0901000001", 2, "2026-06-02", "2026-06-04", BookingStatus.PENDING, 1960000, 280000, 224000, 2464000, null],
    ["bk-confirmed-1", "hs-ba-den", "room-ba-den-pine", "Khách gọi điện", "0902222333", 2, "2026-06-15", "2026-06-17", BookingStatus.CONFIRMED, 1840000, 180000, 202000, 2222000, "u-owner-staff"],
    ["bk-completed-1", "hs-trang-bang", "room-trang-bang-deluxe", "Minh Anh", "0901000001", 2, "2026-05-10", "2026-05-11", BookingStatus.COMPLETED, 720000, 300000, 102000, 1122000, null],
    ["bk-cancelled-1", "hs-trang-bang", "room-trang-bang-deluxe", "Minh Anh", "0901000001", 2, "2026-05-15", "2026-05-16", BookingStatus.CANCELLED, 720000, 0, 72000, 792000, null]
  ] as const;

  for (const [id, homestayId, roomId, guestName, guestPhone, guestCount, checkIn, checkOut, status, roomTotal, serviceTotal, taxTotal, grandTotal, proxyCreatedBy] of bookings) {
    await prisma.booking.upsert({
      where: { id },
      update: { status, roomTotal, serviceTotal, taxTotal, grandTotal },
      create: {
        id,
        customerId: "u-customer",
        homestayId,
        roomId,
        guestName,
        guestPhone,
        guestCount,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        status,
        roomTotal,
        serviceTotal,
        taxTotal,
        grandTotal,
        proxyCreatedBy
      }
    });
  }

  for (const [id, bookingId, serviceId, name, quantity, unitPrice, status] of [
    ["bs-demo-1", "bk-demo-1", "svc-bbq", "Tiệc BBQ sân vườn", 1, 650000, ServiceOrderStatus.SERVED],
    ["bs-pending-1", "bk-pending-1", "svc-ma-loi-fire", "Lửa trại tối", 1, 280000, ServiceOrderStatus.PREPARING],
    ["bs-confirmed-1", "bk-confirmed-1", "svc-bike-ba-den", "Thuê xe máy", 1, 180000, ServiceOrderStatus.PREPARING],
    ["bs-completed-1", "bk-completed-1", "svc-trang-bang-food", "Tour ẩm thực Trảng Bàng", 1, 300000, ServiceOrderStatus.SERVED]
  ] as const) {
    await prisma.bookingService.upsert({
      where: { id },
      update: { quantity, unitPrice, total: quantity * unitPrice, status },
      create: { id, bookingId, serviceId, name, quantity, unitPrice, total: quantity * unitPrice, status }
    });
  }

  for (const [id, bookingId, status, amount] of [
    ["pay-demo-1", "bk-demo-1", PaymentStatus.PAID, 3905000],
    ["pay-pending-1", "bk-pending-1", PaymentStatus.PENDING, 2464000],
    ["pay-confirmed-1", "bk-confirmed-1", PaymentStatus.INITIATED, 2222000],
    ["pay-completed-1", "bk-completed-1", PaymentStatus.PAID, 1122000],
    ["pay-cancelled-1", "bk-cancelled-1", PaymentStatus.FAILED, 792000]
  ] as const) {
    await prisma.payment.upsert({
      where: { bookingId },
      update: { provider: "mock-apipay", providerRef: id, status, amount, checkoutUrl: `/payment/result?bookingId=${bookingId}` },
      create: { id, bookingId, provider: "mock-apipay", providerRef: id, status, amount, checkoutUrl: `/payment/result?bookingId=${bookingId}` }
    });
  }

  await Promise.all([
    prisma.review.upsert({
      where: { id: "rev-1" },
      update: { rating: 5, comment: "Không gian xanh, yên tĩnh, sân BBQ rất hợp đi nhóm." },
      create: { id: "rev-1", userId: "u-customer", homestayId: "hs-ba-den", rating: 5, comment: "Không gian xanh, yên tĩnh, sân BBQ rất hợp đi nhóm." }
    }),
    prisma.article.upsert({
      where: { id: "art-1" },
      update: { status: ArticleStatus.PUBLISHED },
      create: {
        id: "art-1",
        authorId: "u-staff",
        title: "Khám phá Núi Bà Đen cuối tuần",
        slug: "kham-pha-nui-ba-den-cuoi-tuan",
        excerpt: "Lịch trình thư giãn hai ngày một đêm tại Tây Ninh.",
        content: "Gợi ý hành trình, món ngon và nơi lưu trú gần Núi Bà Đen.",
        status: ArticleStatus.PUBLISHED
      }
    }),
    prisma.article.upsert({
      where: { id: "art-2" },
      update: { status: ArticleStatus.DRAFT },
      create: {
        id: "art-2",
        authorId: "u-staff",
        title: "Checklist đặt homestay cho nhóm bạn",
        slug: "checklist-dat-homestay-nhom-ban",
        excerpt: "Những điểm cần kiểm tra trước khi đặt phòng nhóm.",
        content: "Số khách, dịch vụ đi kèm, chính sách hủy và tiện ích bếp nướng.",
        status: ArticleStatus.DRAFT
      }
    }),
    prisma.violationReport.upsert({
      where: { id: "report-1" },
      update: { status: ViolationReportStatus.OPEN },
      create: { id: "report-1", reporterId: "u-customer", reportedUserId: "u-owner", reason: "Thông tin dịch vụ cần được xác minh.", status: ViolationReportStatus.OPEN }
    }),
    prisma.violationReport.upsert({
      where: { id: "report-2" },
      update: { status: ViolationReportStatus.RESOLVED },
      create: { id: "report-2", reporterId: "u-customer", reportedUserId: "u-owner", reason: "Báo cáo đã được đội vận hành xử lý.", status: ViolationReportStatus.RESOLVED }
    })
  ]);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
