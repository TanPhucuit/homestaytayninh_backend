import { Module } from "@nestjs/common";
import { SupabaseHealthService } from "./supabase-health.service";
import { SupabaseCatalogService } from "./supabase-catalog.service";

@Module({
  providers: [SupabaseHealthService, SupabaseCatalogService],
  exports: [SupabaseHealthService, SupabaseCatalogService]
})
export class SupabaseModule {}
