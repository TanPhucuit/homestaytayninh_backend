import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface ConnectionHealthCheck {
  id: string;
  source: string;
  message: string;
  created_at: string;
}

export interface SupabaseHealthResult {
  ok: true;
  inserted: ConnectionHealthCheck;
  recent: ConnectionHealthCheck[];
}

@Injectable()
export class SupabaseHealthService {
  private readonly client: SupabaseClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const key = config.get<string>("SUPABASE_PUBLISHABLE_KEY") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  async check(): Promise<SupabaseHealthResult> {
    if (!this.client) {
      throw new ServiceUnavailableException("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");
    }

    const insert = await this.client
      .from("connection_health_checks")
      .insert({ source: "backend", message: "NestJS backend connected to Supabase" })
      .select("id, source, message, created_at")
      .single<ConnectionHealthCheck>();

    if (insert.error) {
      throw new ServiceUnavailableException(insert.error.message);
    }

    const recent = await this.client
      .from("connection_health_checks")
      .select("id, source, message, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<ConnectionHealthCheck[]>();

    if (recent.error) {
      throw new ServiceUnavailableException(recent.error.message);
    }

    return {
      ok: true,
      inserted: insert.data,
      recent: recent.data
    };
  }
}
