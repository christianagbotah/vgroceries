import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const hero = readFileSync("src/features/catalog/storefront-editorial-hero.tsx","utf8");
const assistant = readFileSync("src/features/ai/customer-voice-concierge.tsx","utf8");

describe("mobile hero buttons", () => {
  test("two CTAs are in a fixed two-column grid before the tablet breakpoint", () => {
    expect(hero).toContain('grid min-w-0 grid-cols-2 items-stretch gap-2 sm:flex');
    expect(hero).toContain('w-full items-center justify-center');
    expect(hero).toContain('min-w-0 break-words');
    expect(hero).toContain("sm:w-auto");
  });
  test("retains real slide destinations, touch targets, and carousel controls", () => {
    expect(hero).toContain('href={current.ctaHref}');
    expect(hero).toContain('href={current.secondaryCtaHref}');
    expect(hero).toContain("min-h-11");
    expect(hero).toContain("setActive(index => (index + 1) % slides.length)");
  });
});

describe("mobile assistant shortcut", () => {
  test("starts collapsed as an icon-and-caret tab sized 44px", () => {
    expect(assistant).toContain("const [launcherExpanded,setLauncherExpanded]=useState(false)");
    expect(assistant).toContain('aria-label="Expand shopping assistant shortcut" aria-expanded="false"');
    expect(assistant).toContain('className="flex size-11');
    expect(assistant).toContain('<ChevronLeft');
  });
  test("has explicit expand, collapse and open actions while preserving desktop button", () => {
    expect(assistant).toContain("onClick={()=>setLauncherExpanded(true)}");
    expect(assistant).toContain("onClick={()=>setLauncherExpanded(false)}");
    expect(assistant).toContain('aria-label="Collapse shopping assistant shortcut" aria-expanded="true"');
    expect(assistant).toContain('aria-label="Open grocery chat and voice assistant"');
    expect(assistant).toContain("md:flex");
    expect(assistant).toContain("setLauncherExpanded(false);recognition.current?.stop()");
  });
  test("chat stays bounded to viewport and above mobile navigation", () => {
    expect(assistant).toContain('fixed bottom-20 right-3');
    expect(assistant).toContain('w-[min(400px,calc(100vw-24px))]');
    expect(assistant).toContain("max-h-[min(68dvh,580px)]");
    expect(assistant).toContain('aria-label="Variety Groceries shopping assistant"');
  });
});
