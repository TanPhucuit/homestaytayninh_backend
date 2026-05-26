import { Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { CommonModule } from "../common/common.module";
import { HomestaysController } from "./homestays.controller";

@Module({
  imports: [CacheModule, CommonModule],
  controllers: [HomestaysController]
})
export class HomestaysModule {}
