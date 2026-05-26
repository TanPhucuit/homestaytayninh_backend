import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { BookingsController } from "./bookings.controller";

@Module({
  imports: [CommonModule],
  controllers: [BookingsController]
})
export class BookingsModule {}
