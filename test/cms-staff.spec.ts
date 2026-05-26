import { describe, expect, it } from "vitest";
import { DemoStoreService } from "../src/common/demo-store.service";

describe("staff cms and moderation operations", () => {
  it("creates, edits, publishes, unpublishes, and deletes articles", () => {
    const store = new DemoStoreService();
    const article = store.createArticle({
      title: "Tin mới Tây Ninh",
      slug: "tin-moi-tay-ninh",
      excerpt: "Tin tức du lịch",
      content: "Nội dung bài viết",
      status: "DRAFT"
    });

    expect(article.status).toBe("DRAFT");
    expect(store.updateArticle(article.id, { title: "Tin mới Tây Ninh đã sửa" }).title).toBe("Tin mới Tây Ninh đã sửa");
    expect(store.setArticleStatus(article.id, "PUBLISHED").status).toBe("PUBLISHED");
    expect(store.setArticleStatus(article.id, "DRAFT").status).toBe("DRAFT");
    expect(store.deleteArticle(article.id).id).toBe(article.id);
  });

  it("resolves violation reports", () => {
    const store = new DemoStoreService();
    const report = store.reports[0];

    expect(store.resolveReport(report.id).status).toBe("RESOLVED");
  });
});
