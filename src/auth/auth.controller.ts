import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { SupabaseAuthGuard } from "../common/auth.guard";

@Controller("auth")
export class AuthController {
  @UseGuards(SupabaseAuthGuard)
  @Get("me")
  me(@Req() request: Request) {
    return request.user;
  }
}
