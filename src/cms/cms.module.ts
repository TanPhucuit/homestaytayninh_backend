import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { CmsController } from "./cms.controller";

@Module({
  imports: [CommonModule],
  controllers: [CmsController]
})
export class CmsModule {}
