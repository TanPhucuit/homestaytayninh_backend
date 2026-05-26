import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { SupabaseCatalogService } from "../supabase/supabase-catalog.service";

@Controller("homestays")
export class HomestaysController {
  constructor(
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(SupabaseCatalogService) private readonly catalog: SupabaseCatalogService
  ) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>) {
    this.validateNumericQuery(query.guests, "guests");
    this.validateNumericQuery(query.maxPrice, "maxPrice");
    this.validateDateRange(query.checkIn, query.checkOut);
    const key = `homestays:${JSON.stringify(query)}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = await this.catalog.list(query);
    await this.cache.set(key, data, 30);
    return data;
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const key = `homestay:${id}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = await this.catalog.detail(id);
    await this.cache.set(key, data, 60);
    return data;
  }

  private validateNumericQuery(value: string | undefined, field: string) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
  }

  private validateDateRange(checkIn?: string, checkOut?: string) {
    if (!checkIn && !checkOut) return;
    if (!checkIn || !checkOut) throw new BadRequestException("Both checkIn and checkOut are required");
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new BadRequestException("checkOut must be after checkIn");
    }
  }
}
