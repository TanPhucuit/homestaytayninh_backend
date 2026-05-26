import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./auth.decorator";
import { DemoUser, UserRole } from "./domain";

declare module "express-serve-static-core" {
  interface Request {
    user?: DemoUser;
  }
}

@Injectable()
export class DemoAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const user: DemoUser = {
      id: String(request.headers["x-user-id"] ?? "u-customer"),
      name: String(request.headers["x-user-name"] ?? "Demo User"),
      email: String(request.headers["x-user-email"] ?? "demo@homestay.vn"),
      role: String(request.headers["x-user-role"] ?? "CUSTOMER") as UserRole,
      banned: false
    };

    request.user = user;
    if (!roles?.length) return true;
    if (roles.includes(user.role)) return true;
    throw new ForbiddenException(`Role ${user.role} cannot access this resource`);
  }
}
