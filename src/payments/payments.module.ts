import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { PaymentsController } from "./payments.controller";

@Module({
  imports: [CommonModule],
  controllers: [PaymentsController]
})
export class PaymentsModule {}
