import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [SupabaseModule],
  controllers: [HealthController]
})
export class HealthModule {}
