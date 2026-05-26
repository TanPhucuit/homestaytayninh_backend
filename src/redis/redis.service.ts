import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis, { RedisOptions } from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client?: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("REDIS_URL is required in production.");
      }
      return;
    }

    const options: RedisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000)
    };

    this.client = new Redis(redisUrl, options);
    this.client.on("connect", () => this.logger.log("Redis connected"));
    this.client.on("error", (error: Error) => this.logger.error("Redis error", error.stack));
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || this.client.status === "ready" || this.client.status === "connect") return;
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.client) return undefined;
    const value = await this.client.get(key);
    return value === null ? undefined : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.client) return;
    const serialized = JSON.stringify(value);
    if (ttl && ttl > 0) {
      await this.client.set(key, serialized, "EX", ttl);
      return;
    }
    await this.client.set(key, serialized);
  }

  async del(key: string): Promise<number> {
    if (!this.client) return 0;
    return this.client.del(key);
  }
}
