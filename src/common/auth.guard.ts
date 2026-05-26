import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_KEY, ROLES_KEY } from "./auth.decorator";
import { BusinessStoreService } from "./business-store.service";
import { DemoUser, UserRole } from "./domain";

declare module "express-serve-static-core" {
  interface Request {
    user?: DemoUser;
  }
}

@Injectable()
export class DemoAuthGuard implements CanActivate {
  private readonly supabase?: SupabaseClient;
  private readonly supabaseAuth: boolean;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) config: ConfigService,
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService
  ) {
    this.supabaseAuth = config.get<string>("AUTH_MODE") === "supabase";
    const url = config.get<string>("SUPABASE_URL");
    const key = config.get<string>("SUPABASE_PUBLISHABLE_KEY");
    if (this.supabaseAuth && url && key) {
      this.supabase = createClient(url, key, { auth: { persistSession: false } });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const user = this.supabaseAuth ? await this.fromSupabase(request.headers.authorization) : this.fromDemoHeaders(request.headers);

    request.user = user;
    if (!roles?.length) return true;
    if (roles.includes(user.role)) return true;
    throw new ForbiddenException(`Role ${user.role} cannot access this resource`);
  }

  private fromDemoHeaders(headers: Record<string, string | string[] | undefined>): DemoUser {
    return {
      id: String(headers["x-user-id"] ?? "u-customer"),
      name: String(headers["x-user-name"] ?? "Demo User"),
      email: String(headers["x-user-email"] ?? "demo@homestay.vn"),
      role: String(headers["x-user-role"] ?? "CUSTOMER") as UserRole,
      banned: false
    };
  }

  private async fromSupabase(authorization?: string) {
    if (!this.supabase) throw new UnauthorizedException("Supabase authentication is not configured");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Bearer token is required");
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException("Invalid session");
    return this.store.findAuthenticatedUser(data.user.id, data.user.email);
  }
}
