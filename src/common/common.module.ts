import { Module } from "@nestjs/common";
import { DemoStoreService } from "./demo-store.service";

@Module({
  providers: [DemoStoreService],
  exports: [DemoStoreService]
})
export class CommonModule {}
