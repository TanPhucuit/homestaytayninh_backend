import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY, ROLES_KEY } from "./auth.decorator";
import { BusinessStoreService } from "./business-store.service";
import { AuthenticatedUser, UserRole } from "./domain";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class RedisSessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const user = await this.fromSession(request.headers.authorization);

    request.user = user;
    if (!roles?.length || roles.includes(user.role)) return true;
    throw new ForbiddenException(`Role ${user.role} cannot access this resource`);
  }

  private async fromSession(authorization?: string) {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Bearer session token is required");
    const user = await this.store.getSession(token);
    if (!user) throw new UnauthorizedException("Invalid session");
    return user;
  }
}
