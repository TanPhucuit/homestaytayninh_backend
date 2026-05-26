import { Module } from "@nestjs/common";
import { BusinessStoreService } from "./business-store.service";

@Module({
  providers: [BusinessStoreService],
  exports: [BusinessStoreService]
})
export class CommonModule {}
