import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { RedisModule } from "../redis/redis.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [CommonModule, RedisModule],
  controllers: [HealthController]
})
export class HealthModule {}
