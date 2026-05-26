import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis, { RedisOptions } from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required. Redis is the primary persistence store.");
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
    if (this.client.status === "ready" || this.client.status === "connect") return;
    await this.client.connect();
    await this.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.client.get(key);
    return value === null ? undefined : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl && ttl > 0) {
      await this.client.set(key, serialized, "EX", ttl);
      return;
    }
    await this.client.set(key, serialized);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!members.length) return 0;
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (!members.length) return 0;
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }
}
