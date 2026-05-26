import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { UserRole } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";

@UseGuards(DemoAuthGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly store: DemoStoreService) {}

  @Get("dashboard")
  @Roles("ADMIN", "STAFF")
  dashboard() {
    return this.store.metrics();
  }

  @Get("users")
  @Roles("ADMIN", "STAFF")
  users() {
    return this.store.users;
  }

  @Post("users")
  @Roles("ADMIN")
  createUser(@Body() body: { name?: string; email?: string; phone?: string; role?: UserRole }) {
    return this.store.createUser(body);
  }

  @Get("reports")
  @Roles("ADMIN", "STAFF")
  reports() {
    return this.store.reports;
  }

  @Post("reports/:id/resolve")
  @Roles("ADMIN", "STAFF")
  resolveReport(@Param("id") reportId: string) {
    return this.store.resolveReport(reportId);
  }

  @Patch("users/:id")
  @Roles("ADMIN")
  updateUser(@Param("id") userId: string, @Body() body: { role?: UserRole; banned?: boolean }) {
    if (body.role) this.store.setRole(userId, body.role);
    if (typeof body.banned === "boolean") this.store.banUser(userId, body.banned);
    return this.store.users.find((user) => user.id === userId);
  }

  @Post("users/:id/ban")
  @Roles("ADMIN", "STAFF")
  ban(@Param("id") userId: string) {
    return this.store.banUser(userId, true);
  }

  @Post("users/:id/unban")
  @Roles("ADMIN", "STAFF")
  unban(@Param("id") userId: string) {
    return this.store.banUser(userId, false);
  }

  @Post("users/:id/role")
  @Roles("ADMIN")
  assignRole(@Param("id") userId: string, @Body() body: { role: UserRole }) {
    return this.store.setRole(userId, body.role);
  }
}
