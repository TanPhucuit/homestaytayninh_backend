import { PrismaClient, UserRole, ViolationReportStatus } from "@prisma/client";

const prisma = new PrismaClient();

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for isolated integration fixtures.`);
  return value;
}

async function main() {
  if (process.env.ALLOW_ISOLATED_TEST_MUTATIONS !== "true") {
    throw new Error("Refusing test fixture seed without ALLOW_ISOLATED_TEST_MUTATIONS=true.");
  }
  const testApiUrl = required("TEST_API_URL");
  if (testApiUrl.includes("homestaytayninh-backend.onrender.com")) {
    throw new Error("Refusing to seed integration fixtures for the production backend.");
  }

  const profiles: Array<{ id: string; email: string; role: UserRole; banned?: boolean }> = [
    { id: "u-test-admin", email: required("TEST_ADMIN_EMAIL"), role: UserRole.ADMIN },
    { id: "u-test-staff", email: required("TEST_STAFF_EMAIL"), role: UserRole.STAFF },
    { id: "u-test-owner", email: required("TEST_OWNER_EMAIL"), role: UserRole.OWNER },
    { id: "u-test-owner-staff", email: required("TEST_OWNER_STAFF_EMAIL"), role: UserRole.OWNER_STAFF },
    { id: "u-test-customer", email: required("TEST_CUSTOMER_EMAIL"), role: UserRole.CUSTOMER },
    { id: "u-test-banned", email: required("TEST_BANNED_EMAIL"), role: UserRole.CUSTOMER, banned: true },
    { id: "u-test-other-customer", email: "other-customer@test.invalid", role: UserRole.CUSTOMER },
    { id: "u-test-other-owner", email: "other-owner@test.invalid", role: UserRole.OWNER }
  ];

  for (const profile of profiles) {
    await prisma.userProfile.upsert({
      where: { id: profile.id },
      update: { email: profile.email.toLowerCase(), role: profile.role, banned: profile.banned ?? false },
      create: {
        id: profile.id,
        email: profile.email.toLowerCase(),
        name: profile.id,
        role: profile.role,
        banned: profile.banned ?? false
      }
    });
  }

  await prisma.ownerStaffAssignment.upsert({
    where: { homestayId_staffId: { homestayId: "hs-ba-den", staffId: "u-test-owner-staff" } },
    update: {},
    create: { homestayId: "hs-ba-den", staffId: "u-test-owner-staff" }
  });

  await prisma.homestay.upsert({
    where: { id: "hs-test-unassigned" },
    update: { ownerId: "u-test-other-owner" },
    create: {
      id: "hs-test-unassigned",
      ownerId: "u-test-other-owner",
      name: "Isolated Test Homestay",
      type: "Phòng",
      location: "Test branch",
      description: "Only used for isolated authorization tests.",
      priceFrom: 100000,
      capacity: 2,
      imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80"
    }
  });
  await prisma.room.upsert({
    where: { id: "room-test-unassigned" },
    update: { homestayId: "hs-test-unassigned", active: true },
    create: {
      id: "room-test-unassigned",
      homestayId: "hs-test-unassigned",
      name: "Unauthorized room",
      roomType: "Phòng",
      pricePerNight: 100000,
      capacity: 2,
      totalUnits: 1,
      active: true
    }
  });
  await prisma.booking.upsert({
    where: { id: "bk-test-other" },
    update: {},
    create: {
      id: "bk-test-other",
      customerId: "u-test-other-customer",
      homestayId: "hs-test-unassigned",
      roomId: "room-test-unassigned",
      guestName: "Other customer",
      guestPhone: "0900000000",
      guestCount: 1,
      checkIn: new Date("2030-08-01"),
      checkOut: new Date("2030-08-02"),
      roomTotal: 100000,
      grandTotal: 100000
    }
  });
  await prisma.violationReport.upsert({
    where: { id: "report-test-open" },
    update: { status: ViolationReportStatus.OPEN },
    create: {
      id: "report-test-open",
      reporterId: "u-test-customer",
      reportedUserId: "u-test-other-owner",
      reason: "Isolated moderation test",
      status: ViolationReportStatus.OPEN
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
