import { Inject, Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class CacheService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.redis.get<T>(key);
  }

  async set<T>(key: string, value: T, seconds = 60): Promise<void> {
    await this.redis.set(key, value, seconds);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }
}
