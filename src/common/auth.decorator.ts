import { SetMetadata } from "@nestjs/common";
import { UserRole } from "./domain";

export const ROLES_KEY = "roles";
export const PUBLIC_KEY = "public";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
