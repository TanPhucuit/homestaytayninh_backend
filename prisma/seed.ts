import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.userProfile.upsert({
    where: { email: "owner@homestay.vn" },
    update: {},
    create: {
      id: "u-owner",
      name: "Chu Homestay",
      email: "owner@homestay.vn",
      phone: "0901000002",
      role: UserRole.OWNER
    }
  });

  await prisma.userProfile.upsert({
    where: { email: "customer@homestay.vn" },
    update: {},
    create: {
      id: "u-customer",
      name: "Minh Anh",
      email: "customer@homestay.vn",
      phone: "0901000001",
      role: UserRole.CUSTOMER
    }
  });

  const homestay = await prisma.homestay.upsert({
    where: { id: "hs-ba-den" },
    update: {},
    create: {
      id: "hs-ba-den",
      ownerId: owner.id,
      name: "Terra Leaf Nui Ba",
      type: "Nha nguyen can",
      location: "Gan nui Ba Den, Tay Ninh",
      description: "Can nha vuon am cung voi view nui, bep rieng va san BBQ.",
      priceFrom: 1450000,
      capacity: 8,
      rating: 4.8,
      imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80"
    }
  });

  await prisma.room.upsert({
    where: { id: "room-ba-den-family" },
    update: {},
    create: {
      id: "room-ba-den-family",
      homestayId: homestay.id,
      name: "Family Garden House",
      roomType: "Nha nguyen can",
      pricePerNight: 1450000,
      capacity: 8,
      totalUnits: 1
    }
  });

  await prisma.service.upsert({
    where: { id: "svc-bbq" },
    update: {},
    create: {
      id: "svc-bbq",
      homestayId: homestay.id,
      name: "Tiec BBQ san vuon",
      description: "Set BBQ cho 4 nguoi",
      unitPrice: 650000
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
