import { Controller, Get, Inject } from "@nestjs/common";
import { SupabaseHealthService } from "../supabase/supabase-health.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(SupabaseHealthService) private readonly supabaseHealth: SupabaseHealthService) {}

  @Get()
  health() {
    return {
      ok: true,
      service: "homestaytayninh-backend",
      timestamp: new Date().toISOString()
    };
  }

  @Get("supabase")
  supabase() {
    return this.supabaseHealth.check();
  }
}
