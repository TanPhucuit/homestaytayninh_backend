import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../common/auth.decorator";
import { DemoAuthGuard } from "../common/auth.guard";
import { ArticleStatus } from "../common/domain";
import { DemoStoreService } from "../common/demo-store.service";

@UseGuards(DemoAuthGuard)
@Controller("cms/articles")
export class CmsController {
  constructor(@Inject(DemoStoreService) private readonly store: DemoStoreService) {}

  @Get()
  @Roles("STAFF", "ADMIN")
  list() {
    return this.store.articles;
  }

  @Post()
  @Roles("STAFF", "ADMIN")
  create(@Body() body: Record<string, unknown>) {
    return this.store.createArticle({
      authorId: "u-staff",
      title: String(body.title ?? "Bai viet moi"),
      slug: String(body.slug ?? `post-${Date.now()}`),
      excerpt: String(body.excerpt ?? ""),
      content: String(body.content ?? ""),
      status: String(body.status ?? "DRAFT") as ArticleStatus
    });
  }

  @Patch(":id")
  @Roles("STAFF", "ADMIN")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateArticle(id, body);
  }

  @Delete(":id")
  @Roles("STAFF", "ADMIN")
  delete(@Param("id") id: string) {
    return this.store.deleteArticle(id);
  }

  @Post(":id/publish")
  @Roles("STAFF", "ADMIN")
  publish(@Param("id") id: string) {
    return this.store.setArticleStatus(id, "PUBLISHED");
  }

  @Post(":id/unpublish")
  @Roles("STAFF", "ADMIN")
  unpublish(@Param("id") id: string) {
    return this.store.setArticleStatus(id, "DRAFT");
  }
}
