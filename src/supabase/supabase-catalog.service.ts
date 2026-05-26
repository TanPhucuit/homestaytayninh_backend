import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { Homestay, Service } from "../common/domain";

interface CatalogHomestayRow {
  id: string;
  ownerId: string;
  name: string;
  type: Homestay["type"];
  location: string;
  description: string;
  priceFrom: number;
  capacity: number;
  rating: number;
  imageUrl: string;
  rooms: Homestay["rooms"];
  amenities: Array<{ name: string }>;
  services: Service[];
  reviews: Homestay["reviews"];
  images?: unknown[];
  bookings?: Array<{ roomId: string; checkIn: Date; checkOut: Date }>;
}

@Injectable()
export class SupabaseCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const databaseUrl = config.get<string>("DATABASE_URL");
    if (!databaseUrl?.startsWith("postgres")) throw new Error("DATABASE_URL is required for catalog queries.");
    this.prisma = new PrismaClient();
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  async list(query: Record<string, string | undefined>): Promise<Homestay[]> {
    const { checkIn, checkOut } = this.optionalDateRange(query.checkIn, query.checkOut);
    const guests = query.guests ? Number(query.guests) : undefined;
    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(guests ? { capacity: { gte: guests } } : {}),
      ...(query.maxPrice ? { priceFrom: { lte: Number(query.maxPrice) } } : {}),
      ...(query.amenity ? { amenities: { some: { name: query.amenity } } } : {})
    };
    const rows = await this.prisma.homestay.findMany({
      where,
      include: {
        rooms: true,
        amenities: true,
        services: true,
        reviews: true,
        images: true,
        bookings: checkIn && checkOut
          ? { where: { status: { in: ["PENDING", "CONFIRMED", "IN_STAY"] }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } } }
          : false
      },
      orderBy: { rating: "desc" }
    });
    return rows
      .map((row) => this.map(row as CatalogHomestayRow, { checkIn, checkOut, guests }))
      .filter((homestay) => homestay.rooms.length > 0);
  }

  async detail(id: string): Promise<Homestay> {
    const row = await this.prisma.homestay.findUnique({
      where: { id },
      include: { rooms: true, amenities: true, services: true, reviews: true, images: true }
    });
    if (!row) throw new NotFoundException("Homestay not found");
    return this.map(row as CatalogHomestayRow);
  }

  private map(row: CatalogHomestayRow, availability?: { checkIn?: Date; checkOut?: Date; guests?: number }): Homestay {
    const rooms = availability?.checkIn && availability.checkOut
      ? row.rooms.filter((room) => room.active && (!availability.guests || room.capacity >= availability.guests) && this.availableUnits(row, room.id) > 0)
      : row.rooms.filter((room) => room.active);
    return {
      ...row,
      amenities: row.amenities.map((amenity) => amenity.name),
      includedServices: row.services.filter((service) => service.included),
      services: row.services.filter((service) => !service.included),
      rooms
    };
  }

  private availableUnits(row: CatalogHomestayRow, roomId: string) {
    const room = row.rooms.find((item) => item.id === roomId);
    if (!room) return 0;
    const reserved = (row.bookings ?? []).filter((booking) => booking.roomId === roomId).length;
    return room.totalUnits - reserved;
  }

  private optionalDateRange(checkIn?: string, checkOut?: string) {
    if (!checkIn && !checkOut) return {};
    if (!checkIn || !checkOut) throw new BadRequestException("Both checkIn and checkOut are required for availability search");
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new BadRequestException("checkOut must be after checkIn");
    }
    return { checkIn: start, checkOut: end };
  }
}
