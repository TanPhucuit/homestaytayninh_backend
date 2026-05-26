import { Controller, Get, Inject } from "@nestjs/common";
import { BusinessStoreService } from "../common/business-store.service";
import { RedisService } from "../redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService
  ) {}

  @Get()
  health() {
    return {
      ok: true,
      service: "homestaytayninh-backend",
      persistence: "redis",
      storeReady: this.store.persistent,
      timestamp: new Date().toISOString()
    };
  }

  @Get("redis")
  async redisHealth() {
    const pong = await this.redis.ping();
    return { ok: pong === "PONG", persistence: "redis", timestamp: new Date().toISOString() };
  }
}
