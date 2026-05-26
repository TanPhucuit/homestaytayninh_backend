import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_KEY, ROLES_KEY } from "./auth.decorator";
import { BusinessStoreService } from "./business-store.service";
import { AuthenticatedUser, UserRole } from "./domain";
import { supabaseServerOptions } from "../supabase/supabase-client-options";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly supabase: SupabaseClient;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) config: ConfigService,
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService
  ) {
    const url = config.get<string>("SUPABASE_URL");
    const key = config.get<string>("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
    this.supabase = createClient(url, key, supabaseServerOptions);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const user = await this.fromSupabase(request.headers.authorization);

    request.user = user;
    if (!roles?.length) return true;
    if (roles.includes(user.role)) return true;
    throw new ForbiddenException(`Role ${user.role} cannot access this resource`);
  }

  private async fromSupabase(authorization?: string) {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Bearer token is required");
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException("Invalid session");
    return this.store.findAuthenticatedUser(data.user.id, data.user.email);
  }
}
