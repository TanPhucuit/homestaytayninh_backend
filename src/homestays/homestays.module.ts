import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { HomestaysController } from "./homestays.controller";

@Module({
  imports: [SupabaseModule],
  controllers: [HomestaysController]
})
export class HomestaysModule {}
