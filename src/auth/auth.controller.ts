import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { Public } from "../common/auth.decorator";
import { RedisSessionAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { homeForRole } from "./role-home";

interface GoogleTokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(BusinessStoreService) private readonly store: BusinessStoreService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Public()
  @Post("google-login")
  async googleLogin(@Body() body: { idToken?: string }) {
    const profile = await this.verifyGoogleIdToken(String(body.idToken ?? ""));
    const user = await this.store.findOrCreateGoogleUser({
      googleSub: profile.sub!,
      email: profile.email!,
      name: profile.name
    });
    const session = await this.store.createSession(user);
    return {
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      user,
      role: user.role,
      redirectTo: homeForRole(user.role)
    };
  }

  @Public()
  @Post("login")
  async passwordLogin(@Body() body: { email?: string; password?: string }) {
    const user = await this.store.loginWithPassword(body);
    const session = await this.store.createSession(user);
    return {
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      user,
      role: user.role,
      redirectTo: homeForRole(user.role)
    };
  }

  @UseGuards(RedisSessionAuthGuard)
  @Get("me")
  me(@Req() request: Request) {
    return request.user;
  }

  @UseGuards(RedisSessionAuthGuard)
  @Post("logout")
  async logout(@Req() request: Request) {
    const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    await this.store.deleteSession(token);
    return { success: true };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
    if (!idToken) throw new BadRequestException("idToken is required");
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is required for Google OAuth verification.");
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      cache: "no-store"
    }).catch(() => null);
    if (!response?.ok) throw new UnauthorizedException("Invalid Google id_token");
    const profile = (await response.json()) as GoogleTokenInfo;
    if (profile.aud !== clientId) throw new UnauthorizedException("Google id_token audience mismatch");
    if (!profile.sub || !profile.email) throw new UnauthorizedException("Google id_token is missing required profile claims");
    if (profile.email_verified !== true && profile.email_verified !== "true") {
      throw new UnauthorizedException("Google email is not verified");
    }
    return profile;
  }
}
