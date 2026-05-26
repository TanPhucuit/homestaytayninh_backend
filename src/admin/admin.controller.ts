import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { UserRole } from "../common/domain";

@UseGuards(DemoAuthGuard)
@Controller("admin")
export class AdminController {
  constructor(@Inject(BusinessStoreService) private readonly store: BusinessStoreService) {}

  @Get("dashboard")
  @Roles("ADMIN")
  async dashboard() {
    return this.store.metrics();
  }

  @Get("users")
  @Roles("ADMIN", "STAFF")
  async users() {
    return this.store.users();
  }

  @Post("users")
  @Roles("ADMIN")
  async createUser(@Body() body: { name?: string; email?: string; phone?: string; role?: UserRole }) {
    return this.store.createUser(body);
  }

  @Get("reports")
  @Roles("ADMIN", "STAFF")
  async reports() {
    return this.store.reports();
  }

  @Post("reports/:id/resolve")
  @Roles("ADMIN", "STAFF")
  async resolveReport(@Param("id") reportId: string) {
    return this.store.resolveReport(reportId);
  }

  @Patch("users/:id")
  @Roles("ADMIN")
  async updateUser(@Param("id") userId: string, @Body() body: { role?: UserRole; banned?: boolean }) {
    if (body.role) await this.store.setRole(userId, body.role);
    if (typeof body.banned === "boolean") return this.store.banUser(userId, body.banned);
    return (await this.store.users()).find((user) => user.id === userId);
  }

  @Post("users/:id/ban")
  @Roles("ADMIN", "STAFF")
  async ban(@Param("id") userId: string) {
    return this.store.banUser(userId, true);
  }

  @Post("users/:id/unban")
  @Roles("ADMIN", "STAFF")
  async unban(@Param("id") userId: string) {
    return this.store.banUser(userId, false);
  }

  @Post("users/:id/role")
  @Roles("ADMIN")
  async assignRole(@Param("id") userId: string, @Body() body: { role: UserRole }) {
    return this.store.setRole(userId, body.role);
  }
}
