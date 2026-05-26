import { Module } from "@nestjs/common";
import { BusinessStoreService } from "./business-store.service";
import { DemoStoreService } from "./demo-store.service";

@Module({
  providers: [DemoStoreService, BusinessStoreService],
  exports: [DemoStoreService, BusinessStoreService]
})
export class CommonModule {}
