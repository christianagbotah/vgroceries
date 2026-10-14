import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const htmlPath = join(root, "deploy", "coming-soon", "index.html");
const logoPath = join(root, "deploy", "coming-soon", "logo.svg");
const socialPreviewPath = join(root, "deploy", "coming-soon", "social-preview.jpg");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("rich coming-soon landing page", () => {
  test("uses the Variety V identity and removes the old Z mark", () => {
    const html = read(htmlPath);
    const logo = read(logoPath);

    expect(html).toContain("Variety Groceries");
    expect(html).toContain("logo.svg");
    expect(logo).toContain('aria-label="Variety Groceries V mark"');
    expect(logo).not.toContain("z-breathe");
  });

  test("renders a content-rich grocery preview rather than a single maintenance card", () => {
    const html = read(htmlPath);

    expect(html).toContain("Fresh Groceries");
    expect(html).toContain("Coming Soon");
    expect(html).toContain('class="category-grid"');
    expect(html).toContain('class="product-grid"');
    expect(html).toContain("Featured Products");
    expect(html).toContain("Fruits");
    expect(html).toContain("Vegetables");
    expect(html).toContain("Dairy");
    expect(html).toContain("Bakery");
    expect(html).toContain("Pantry Staples");
    expect(html).toContain("Meat &amp; Seafood");
  });

  test("uses real grocery photography and keeps commerce actions in preview mode", () => {
    const html = read(htmlPath);

    expect(html).toContain("images.unsplash.com");
    expect(html).toContain("Store preview");
    expect(html).toContain("Launching soon");
    expect(html).not.toContain("window.location");
  });

  test("publishes WhatsApp/Open Graph metadata with a same-domain JPEG preview", () => {
    const html = read(htmlPath);

    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('property="og:url" content="https://varietygroceries.com/"');
    expect(html).toContain('property="og:image" content="https://varietygroceries.com/social-preview.jpg"');
    expect(html).toContain('property="og:image:type" content="image/jpeg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image" content="https://varietygroceries.com/social-preview.jpg"');
    expect(existsSync(socialPreviewPath)).toBe(true);
    if (existsSync(socialPreviewPath)) {
      const image = readFileSync(socialPreviewPath);
      expect(image[0]).toBe(0xff);
      expect(image[1]).toBe(0xd8);
      expect(image.length).toBeGreaterThan(10_000);
    }
  });

  test("keeps the maintenance page responsive and accessible", () => {
    const html = read(htmlPath);

    expect(html).toContain('name="viewport"');
    expect(html).toContain("@media(max-width:760px)");
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Grocery categories"');
  });
});
