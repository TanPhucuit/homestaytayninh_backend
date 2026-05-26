import { Module } from "@nestjs/common";
import { SupabaseHealthService } from "./supabase-health.service";

@Module({
  providers: [SupabaseHealthService],
  exports: [SupabaseHealthService]
})
export class SupabaseModule {}

