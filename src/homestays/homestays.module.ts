import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { HomestaysController } from "./homestays.controller";

@Module({
  imports: [CommonModule, SupabaseModule],
  controllers: [HomestaysController]
})
export class HomestaysModule {}
