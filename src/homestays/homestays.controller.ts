import { Controller, Get, Param, Query } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { DemoStoreService } from "../common/demo-store.service";

@Controller("homestays")
export class HomestaysController {
  constructor(
    private readonly store: DemoStoreService,
    private readonly cache: CacheService
  ) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>) {
    const key = `homestays:${JSON.stringify(query)}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = this.store.searchHomestays(query);
    await this.cache.set(key, data, 30);
    return data;
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const key = `homestay:${id}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const data = this.store.getHomestay(id);
    await this.cache.set(key, data, 60);
    return data;
  }
}
