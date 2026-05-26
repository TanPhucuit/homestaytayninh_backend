import { Controller, Get, Inject } from "@nestjs/common";
import { BusinessStoreService } from "../common/business-store.service";
import { SupabaseHealthService } from "../supabase/supabase-health.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(SupabaseHealthService) private readonly supabaseHealth: SupabaseHealthService,
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService
  ) {}

  @Get()
  health() {
    return {
      ok: true,
      service: "homestaytayninh-backend",
      persistence: this.store.persistent ? "postgres" : "demo",
      timestamp: new Date().toISOString()
    };
  }

  @Get("supabase")
  supabase() {
    return this.supabaseHealth.check();
  }
}
