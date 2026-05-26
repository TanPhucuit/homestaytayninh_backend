import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Homestay, Service } from "../common/domain";
import { supabaseServerOptions } from "./supabase-client-options";

interface CatalogHomestayRow {
  id: string;
  ownerId: string;
  name: string;
  type: Homestay["type"];
  location: string;
  description: string;
  priceFrom: number;
  capacity: number;
  rating: number;
  imageUrl: string;
  rooms: Homestay["rooms"];
  amenities: Array<{ name: string }>;
  services: Service[];
  reviews: Homestay["reviews"];
}

@Injectable()
export class SupabaseCatalogService {
  private readonly client: SupabaseClient | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_URL");
    const key = config.get<string>("SUPABASE_PUBLISHABLE_KEY") ?? config.get<string>("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    this.client = url && key ? createClient(url, key, supabaseServerOptions) : null;
  }

  get enabled() {
    return this.client !== null;
  }

  async list(query: Record<string, string | undefined>): Promise<Homestay[]> {
    if (!this.client) return [];
    let request = this.client
      .from("homestays")
      .select("*, rooms(*), amenities(name), services(*), reviews(*)");
    if (query.type) request = request.eq("type", query.type);
    if (query.guests) request = request.gte("capacity", Number(query.guests));
    if (query.maxPrice) request = request.lte("priceFrom", Number(query.maxPrice));
    const response = await request.order("rating", { ascending: false }).returns<CatalogHomestayRow[]>();
    if (response.error) throw new ServiceUnavailableException(`Supabase catalog query failed: ${response.error.message}`);
    return response.data.map((row) => this.map(row));
  }

  async detail(id: string): Promise<Homestay> {
    if (!this.client) throw new ServiceUnavailableException("Supabase catalog is not configured");
    const response = await this.client
      .from("homestays")
      .select("*, rooms(*), amenities(name), services(*), reviews(*)")
      .eq("id", id)
      .single<CatalogHomestayRow>();
    if (response.error?.code === "PGRST116") throw new NotFoundException("Homestay not found");
    if (response.error) throw new ServiceUnavailableException(`Supabase catalog query failed: ${response.error.message}`);
    return this.map(response.data);
  }

  private map(row: CatalogHomestayRow): Homestay {
    return {
      ...row,
      amenities: row.amenities.map((amenity) => amenity.name),
      includedServices: row.services.filter((service) => service.included),
      services: row.services.filter((service) => !service.included)
    };
  }
}
