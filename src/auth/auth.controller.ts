import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { DemoAuthGuard } from "../common/auth.guard";
import { UserRole } from "../common/domain";
import { BusinessStoreService } from "../common/business-store.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(BusinessStoreService) private readonly store: BusinessStoreService) {}

  @UseGuards(DemoAuthGuard)
  @Get("me")
  me(@Req() request: Request) {
    return request.user;
  }

  @Post("demo-login")
  async demoLogin(@Body() body: { role?: UserRole; email?: string }) {
    return this.store.findUser(body.email, body.role ?? "CUSTOMER");
  }
}
