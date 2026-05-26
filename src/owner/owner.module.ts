import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { OwnerController } from "./owner.controller";

@Module({
  imports: [CommonModule],
  controllers: [OwnerController]
})
export class OwnerModule {}
