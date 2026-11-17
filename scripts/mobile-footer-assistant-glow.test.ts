import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const footer = readFileSync("src/components/layout/storefront-shell.tsx", "utf8");
const concierge = readFileSync("src/features/ai/customer-voice-concierge.tsx", "utf8");
const globalCss = readFileSync("src/app/globals.css", "utf8");

describe("Variety Groceries professional mobile footer grid", () => {
  test("mobile has two equal columns, brand and connect panel span both", () => {
    expect(footer).toContain('grid-cols-2 gap-x-4 gap-y-6');
    expect(footer).toContain('lg:grid-cols-[1.35fr_.8fr_.9fr_.8fr_1.3fr]');
    expect(footer).toContain('col-span-2 min-w-0 space-y-3');
    expect(footer).toContain('col-span-2 min-w-0 rounded-2xl');
    expect(footer).toContain('lg:col-span-1');
    expect(footer).toContain('min-w-0 overflow-hidden bg-');
  });
  test("balanced Shop, Customer service, About and Your shopping link groups", () => {
    for (const group of ["Shop", "Customer service", "About", "Your shopping"]) {
      expect(footer).toContain(`>${group}</h2>`);
    }
    expect(footer).toContain('className="min-w-0 lg:hidden"');
    for (const href of ["/shop", "/track", "/help", "/privacy", "/account/orders", "/account/lists"]) {
      expect(footer).toContain(`href="${href}"`);
    }
    expect(footer).toContain('min-h-8 min-w-0 break-words');
  });
  test("bottom footer text aligns neatly and does not promise active electronic providers", () => {
    expect(footer).toContain('grid max-w-[1500px] gap-2 px-4 py-4 text-center');
    expect(footer).toContain("Electronic methods via approved payment providers");
    expect(footer).not.toContain("Mobile Money · Card · Bank transfer · Cash");
  });
});
describe("mobile assistant unobtrusive attention pulse", () => {
  test("44px assistant tab is still collapsed and its halo does not intercept clicks", () => {
    expect(concierge).toContain('setLauncherExpanded]=useState(false)');
    expect(concierge).toContain('aria-label="Expand shopping assistant shortcut" aria-expanded="false"');
    expect(concierge).toContain('flex size-11 items-center justify-center');
    expect(concierge).toContain('vg-assistant-attention-ring pointer-events-none');
    expect(concierge).toContain('border-[#f8cd78]/70');
  });
  test("halo repeats slowly but stops under reduced-motion settings", () => {
    expect(globalCss).toContain('@keyframes vg-assistant-halo');
    expect(globalCss).toContain('animation: vg-assistant-halo 4.2s ease-out infinite;');
    expect(globalCss).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(concierge).toContain('aria-hidden="true" className="vg-assistant-attention-ring');
  });
  test("expanding removes the ring while full assistant retains original controls", () => {
    expect(concierge).toContain('launcherExpanded ? (');
    expect(concierge).toContain('setLauncherExpanded(true)');
    expect(concierge).toContain('setLauncherExpanded(false)');
    expect(concierge).toContain('aria-label="Collapse shopping assistant shortcut"');
    expect(concierge).toContain('aria-label="Variety Groceries shopping assistant"');
  });
});
