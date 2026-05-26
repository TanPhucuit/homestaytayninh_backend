import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { HomestaysController } from "./homestays.controller";

@Module({
  imports: [CommonModule],
  controllers: [HomestaysController]
})
export class HomestaysModule {}
