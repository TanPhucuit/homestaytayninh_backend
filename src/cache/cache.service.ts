import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly memory = new Map<string, { value: unknown; expiresAt: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (url && process.env.NODE_ENV !== "test") {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redis.on("error", () => undefined);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.redis) {
      try {
        await this.redis.connect().catch(() => undefined);
        const value = await this.redis.get(key);
        return value ? (JSON.parse(value) as T) : undefined;
      } catch {
        return this.getMemory<T>(key);
      }
    }
    return this.getMemory<T>(key);
  }

  async set<T>(key: string, value: T, seconds = 60): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.connect().catch(() => undefined);
        await this.redis.set(key, JSON.stringify(value), "EX", seconds);
        return;
      } catch {
        // Fallback below keeps Vercel preview/demo alive without Redis.
      }
    }
    this.memory.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
  }

  private getMemory<T>(key: string): T | undefined {
    const cached = this.memory.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt < Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return cached.value as T;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
