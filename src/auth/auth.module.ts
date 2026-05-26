import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthController } from "./auth.controller";

@Module({
  imports: [CommonModule],
  controllers: [AuthController]
})
export class AuthModule {}

