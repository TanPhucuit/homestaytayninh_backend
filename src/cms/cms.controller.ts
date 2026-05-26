import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/auth.decorator";
import { SupabaseAuthGuard } from "../common/auth.guard";
import { BusinessStoreService } from "../common/business-store.service";
import { ArticleStatus } from "../common/domain";

@UseGuards(SupabaseAuthGuard)
@Controller("cms/articles")
export class CmsController {
  constructor(@Inject(BusinessStoreService) private readonly store: BusinessStoreService) {}

  @Get()
  @Roles("STAFF", "ADMIN")
  async list() {
    return this.store.articles();
  }

  @Post()
  @Roles("STAFF", "ADMIN")
  async create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.store.createArticle({
      authorId: req.user!.id,
      title: String(body.title ?? "Bài viết mới"),
      slug: String(body.slug ?? `post-${Date.now()}`),
      excerpt: String(body.excerpt ?? ""),
      content: String(body.content ?? ""),
      status: String(body.status ?? "DRAFT") as ArticleStatus
    });
  }

  @Patch(":id")
  @Roles("STAFF", "ADMIN")
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateArticle(id, body);
  }

  @Delete(":id")
  @Roles("STAFF", "ADMIN")
  async delete(@Param("id") id: string) {
    return this.store.deleteArticle(id);
  }

  @Post(":id/publish")
  @Roles("STAFF", "ADMIN")
  async publish(@Param("id") id: string) {
    return this.store.setArticleStatus(id, "PUBLISHED");
  }

  @Post(":id/unpublish")
  @Roles("STAFF", "ADMIN")
  async unpublish(@Param("id") id: string) {
    return this.store.setArticleStatus(id, "DRAFT");
  }
}
