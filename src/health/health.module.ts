import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [CommonModule, SupabaseModule],
  controllers: [HealthController]
})
export class HealthModule {}
