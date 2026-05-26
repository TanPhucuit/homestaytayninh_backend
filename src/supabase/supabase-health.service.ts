import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseHealthResult {
  ok: true;
  catalogReadable: true;
  homestayCount: number;
}

@Injectable()
export class SupabaseHealthService {
  private readonly client: SupabaseClient | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const key = config.get<string>("SUPABASE_PUBLISHABLE_KEY") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  async check(): Promise<SupabaseHealthResult> {
    if (!this.client) {
      throw new ServiceUnavailableException("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");
    }

    const response = await this.client.from("homestays").select("id", { count: "exact", head: true });
    if (response.error) {
      throw new ServiceUnavailableException(response.error.message);
    }

    return {
      ok: true,
      catalogReadable: true,
      homestayCount: response.count ?? 0
    };
  }
}
