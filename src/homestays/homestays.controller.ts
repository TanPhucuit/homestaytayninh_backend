import { BadRequestException, Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { DemoStoreService } from "../common/demo-store.service";
import { SupabaseCatalogService } from "../supabase/supabase-catalog.service";

@Controller("homestays")
export class HomestaysController {
  constructor(
    @Inject(DemoStoreService) private readonly store: DemoStoreService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(SupabaseCatalogService) private readonly catalog: SupabaseCatalogService
  ) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>) {
    this.validateNumericQuery(query.guests, "guests");
    this.validateNumericQuery(query.maxPrice, "maxPrice");
    const key = `homestays:${JSON.stringify(query)}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = this.catalog.enabled ? await this.catalog.list(query) : this.store.searchHomestays(query);
    await this.cache.set(key, data, 30);
    return data;
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const key = `homestay:${id}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = this.catalog.enabled ? await this.catalog.detail(id) : this.store.getHomestay(id);
    await this.cache.set(key, data, 60);
    return data;
  }

  private validateNumericQuery(value: string | undefined, field: string) {
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
  }
}
