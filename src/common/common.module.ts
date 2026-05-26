import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { BusinessStoreService } from "./business-store.service";

@Module({
  imports: [RedisModule],
  providers: [BusinessStoreService],
  exports: [BusinessStoreService]
})
export class CommonModule {}
