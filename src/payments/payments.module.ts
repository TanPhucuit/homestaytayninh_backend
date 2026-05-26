import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { PaymentsController } from "./payments.controller";
import { PaymentProviderService } from "./payment-provider";

@Module({
  imports: [CommonModule],
  controllers: [PaymentsController],
  providers: [PaymentProviderService]
})
export class PaymentsModule {}
