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

async function main() {
  await Promise.all([
    prisma.userProfile.upsert({
      where: { id: "u-customer" },
      update: { name: "Minh Anh", email: "customer@homestay.vn", phone: "0901000001", role: UserRole.CUSTOMER },
      create: {
        id: "u-customer",
        name: "Minh Anh",
        email: "customer@homestay.vn",
        phone: "0901000001",
        role: UserRole.CUSTOMER
      }
    }),
    prisma.userProfile.upsert({
      where: { id: "u-owner" },
      update: { name: "Chủ Homestay", email: "owner@homestay.vn", phone: "0901000002", role: UserRole.OWNER },
      create: {
        id: "u-owner",
        name: "Chủ Homestay",
        email: "owner@homestay.vn",
        phone: "0901000002",
        role: UserRole.OWNER
      }
    }),
    prisma.userProfile.upsert({
      where: { id: "u-owner-staff" },
      update: { name: "Nhân viên Homestay", email: "owner.staff@homestay.vn", role: UserRole.OWNER_STAFF },
      create: {
        id: "u-owner-staff",
        name: "Nhân viên Homestay",
        email: "owner.staff@homestay.vn",
        role: UserRole.OWNER_STAFF
      }
    }),
    prisma.userProfile.upsert({
      where: { id: "u-staff" },
      update: { name: "Nhân viên nội dung", email: "staff@homestay.vn", role: UserRole.STAFF },
      create: { id: "u-staff", name: "Nhân viên nội dung", email: "staff@homestay.vn", role: UserRole.STAFF }
    }),
    prisma.userProfile.upsert({
      where: { id: "u-admin" },
      update: { name: "Quản trị viên", email: "admin@homestay.vn", role: UserRole.ADMIN },
      create: { id: "u-admin", name: "Quản trị viên", email: "admin@homestay.vn", role: UserRole.ADMIN }
    })
  ]);

  await Promise.all([
    prisma.homestay.upsert({
      where: { id: "hs-ba-den" },
      update: {
        name: "Terra Leaf Núi Bà",
        type: "Nhà nguyên căn",
        location: "Gần núi Bà Đen, Tây Ninh",
        description: "Căn nhà vườn ấm cúng với view núi, bếp riêng và sân BBQ cho nhóm bạn hoặc gia đình.",
        priceFrom: 1450000,
        capacity: 8,
        rating: 4.8
      },
      create: {
        id: "hs-ba-den",
        ownerId: "u-owner",
        name: "Terra Leaf Núi Bà",
        type: "Nhà nguyên căn",
        location: "Gần núi Bà Đen, Tây Ninh",
        description: "Căn nhà vườn ấm cúng với view núi, bếp riêng và sân BBQ cho nhóm bạn hoặc gia đình.",
        priceFrom: 1450000,
        capacity: 8,
        rating: 4.8,
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"
      }
    }),
    prisma.homestay.upsert({
      where: { id: "hs-trang-bang" },
      update: {
        name: "Soft Sand Trảng Bàng",
        type: "Phòng",
        location: "Trảng Bàng, Tây Ninh",
        description: "Phòng nghỉ thư thái gần làng nghề bánh tráng, phù hợp cho chuyến đi cuối tuần.",
        priceFrom: 720000,
        capacity: 3,
        rating: 4.6
      },
      create: {
        id: "hs-trang-bang",
        ownerId: "u-owner",
        name: "Soft Sand Trảng Bàng",
        type: "Phòng",
        location: "Trảng Bàng, Tây Ninh",
        description: "Phòng nghỉ thư thái gần làng nghề bánh tráng, phù hợp cho chuyến đi cuối tuần.",
        priceFrom: 720000,
        capacity: 3,
        rating: 4.6,
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"
      }
    })
  ]);

  await Promise.all([
    prisma.ownerStaffAssignment.upsert({
      where: { homestayId_staffId: { homestayId: "hs-ba-den", staffId: "u-owner-staff" } },
      update: {},
      create: { homestayId: "hs-ba-den", staffId: "u-owner-staff" }
    }),
    prisma.ownerStaffAssignment.upsert({
      where: { homestayId_staffId: { homestayId: "hs-trang-bang", staffId: "u-owner-staff" } },
      update: {},
      create: { homestayId: "hs-trang-bang", staffId: "u-owner-staff" }
    }),
    prisma.room.upsert({
      where: { id: "room-ba-den-family" },
      update: { pricePerNight: 1450000, capacity: 8, active: true },
      create: {
        id: "room-ba-den-family",
        homestayId: "hs-ba-den",
        name: "Family Garden House",
        roomType: "Nhà nguyên căn",
        pricePerNight: 1450000,
        capacity: 8,
        totalUnits: 1
      }
    }),
    prisma.room.upsert({
      where: { id: "room-trang-bang-deluxe" },
      update: { pricePerNight: 720000, capacity: 3, active: true },
      create: {
        id: "room-trang-bang-deluxe",
        homestayId: "hs-trang-bang",
        name: "Deluxe Garden Room",
        roomType: "Phòng",
        pricePerNight: 720000,
        capacity: 3,
        totalUnits: 2
      }
    })
  ]);

  await Promise.all([
    prisma.roomRate.upsert({
      where: { id: "00000000-0000-4000-8000-000000000101" },
      update: { pricePerNight: 1650000 },
      create: {
        id: "00000000-0000-4000-8000-000000000101",
        roomId: "room-ba-den-family",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-08-31"),
        pricePerNight: 1650000
      }
    }),
    prisma.homestayImage.upsert({
      where: { id: "00000000-0000-4000-8000-000000000102" },
      update: { position: 1 },
      create: {
        id: "00000000-0000-4000-8000-000000000102",
        homestayId: "hs-ba-den",
        url: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
        alt: "Không gian Terra Leaf Núi Bà",
        position: 1
      }
    })
  ]);

  for (const [id, homestayId, name] of [
    ["00000000-0000-4000-8000-000000000201", "hs-ba-den", "Wifi"],
    ["00000000-0000-4000-8000-000000000202", "hs-ba-den", "Sân BBQ"],
    ["00000000-0000-4000-8000-000000000203", "hs-ba-den", "Bếp riêng"],
    ["00000000-0000-4000-8000-000000000204", "hs-trang-bang", "Wifi"],
    ["00000000-0000-4000-8000-000000000205", "hs-trang-bang", "Bãi đỗ xe"]
  ]) {
    await prisma.amenity.upsert({
      where: { homestayId_name: { homestayId, name } },
      update: {},
      create: { id, homestayId, name }
    });
  }

  const services = [
    ["svc-breakfast", "hs-ba-den", "Bữa sáng", "Bữa sáng bản địa mỗi ngày", 0, true],
    ["svc-wifi", "hs-ba-den", "Wifi", "Internet tốc độ cao", 0, true],
    ["svc-bbq", "hs-ba-den", "Tiệc BBQ sân vườn", "Set BBQ cho 4 người", 650000, false],
    ["svc-trekking", "hs-ba-den", "Trekking Núi Bà", "Hướng dẫn viên nửa ngày", 450000, false],
    ["svc-welcome", "hs-trang-bang", "Nước chào mừng", "Nước thảo mộc địa phương", 0, true],
    ["svc-bike", "hs-trang-bang", "Thuê xe máy", "Thuê xe theo ngày", 160000, false],
    ["svc-water", "hs-trang-bang", "Nước uống", "Nước suối chai", 20000, false]
  ] as const;

  for (const [id, homestayId, name, description, unitPrice, included] of services) {
    await prisma.service.upsert({
      where: { id },
      update: { name, description, unitPrice, included, active: true },
      create: { id, homestayId, name, description, unitPrice, included, active: true }
    });
  }

  await prisma.booking.upsert({
    where: { id: "bk-demo-1" },
    update: { status: BookingStatus.IN_STAY },
    create: {
      id: "bk-demo-1",
      customerId: "u-customer",
      homestayId: "hs-ba-den",
      roomId: "room-ba-den-family",
      guestName: "Minh Anh",
      guestPhone: "0901000001",
      guestCount: 4,
      checkIn: new Date("2026-05-25"),
      checkOut: new Date("2026-05-27"),
      status: BookingStatus.IN_STAY,
      roomTotal: 2900000,
      serviceTotal: 650000,
      taxTotal: 177500,
      grandTotal: 3727500
    }
  });

  await Promise.all([
    prisma.bookingService.upsert({
      where: { id: "bs-demo-1" },
      update: { status: ServiceOrderStatus.SERVED },
      create: {
        id: "bs-demo-1",
        bookingId: "bk-demo-1",
        serviceId: "svc-bbq",
        name: "Tiệc BBQ sân vườn",
        quantity: 1,
        unitPrice: 650000,
        total: 650000,
        status: ServiceOrderStatus.SERVED
      }
    }),
    prisma.payment.upsert({
      where: { bookingId: "bk-demo-1" },
      update: { status: PaymentStatus.PAID },
      create: {
        id: "pay-demo-1",
        bookingId: "bk-demo-1",
        provider: "MOCK_APIPAY",
        providerRef: "demo-paid-1",
        status: PaymentStatus.PAID,
        amount: 3727500
      }
    }),
    prisma.review.upsert({
      where: { id: "rev-1" },
      update: {},
      create: {
        id: "rev-1",
        userId: "u-customer",
        homestayId: "hs-ba-den",
        rating: 5,
        comment: "Không gian xanh, yên tĩnh và dịch vụ chu đáo."
      }
    })
  ]);

  await Promise.all([
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
    prisma.violationReport.upsert({
      where: { id: "report-1" },
      update: {},
      create: {
        id: "report-1",
        reporterId: "u-customer",
        reportedUserId: "u-owner",
        reason: "Thông tin dịch vụ cần được xác minh.",
        status: ViolationReportStatus.OPEN
      }
    }),
    prisma.violationReport.upsert({
      where: { id: "report-2" },
      update: {},
      create: {
        id: "report-2",
        reporterId: "u-customer",
        reportedUserId: "u-owner",
        reason: "Báo cáo đã được đội vận hành xử lý.",
        status: ViolationReportStatus.RESOLVED
      }
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
