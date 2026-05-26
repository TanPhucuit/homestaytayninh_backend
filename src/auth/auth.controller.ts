import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { DemoAuthGuard } from "../common/auth.guard";
import { UserRole } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(DemoStoreService) private readonly store: DemoStoreService) {}

  @UseGuards(DemoAuthGuard)
  @Get("me")
  me(@Req() request: Request) {
    return request.user;
  }

  @Post("demo-login")
  demoLogin(@Body() body: { role?: UserRole; email?: string }) {
    const role = body.role ?? "CUSTOMER";
    const byEmail = body.email ? this.store.users.find((user) => user.email.toLowerCase() === body.email?.toLowerCase()) : undefined;
    const byRole = this.store.users.find((user) => user.role === role);
    return byEmail ?? byRole ?? this.store.users[0];
  }
}
