/**
 * Generates branded SVG product tiles for all seeded products into
 * public/products/<slug>.svg. Deterministic, offline, no external
 * image dependencies — a reliable fallback stands in for photography
 * until the owner supplies real product photos.
 *
 * Run: node scripts/generate-product-svg.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/home/z/my-project/public/products";
mkdirSync(OUT, { recursive: true });

const TINTS = {
  tomato: { bg: "#F7E7DC", accent: "#C4502B" },
  gold: { bg: "#F8EFD9", accent: "#B98A2F" },
  amber: { bg: "#F7EBCB", accent: "#C07A2A" },
  clay: { bg: "#F5E7DC", accent: "#A65E4B" },
  forest: { bg: "#E4EDDF", accent: "#3A5A3C" },
  terracotta: { bg: "#F6E2D6", accent: "#B06040" },
  olive: { bg: "#EBEDDC", accent: "#6B7040" },
  sage: { bg: "#E8ECDF", accent: "#728257" },
  cocoa: { bg: "#F1E4D8", accent: "#6B4A35" },
  moss: { bg: "#E7ECDD", accent: "#55683F" },
};

const GLYPHS = {
  "fresh-produce": `
    <circle cx="200" cy="180" r="58" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M200 122 C 190 100, 212 92, 222 102 C 214 110, 206 114, 200 122 Z" fill="ACCENT"/>
    <path d="M200 124 C 216 107, 238 111, 242 127 C 226 125, 210 127, 200 124 Z" fill="ACCENT" opacity="0.7"/>
    <path d="M172 180 q 14 20 28 0 M 200 180 q 14 20 28 0" stroke="ACCENT" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  "grains-staples": `
    <path d="M152 118 h 96 l 14 138 a 12 12 0 0 1 -12 13 H 150 a 12 12 0 0 1 -12 -13 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M148 152 h 104" stroke="ACCENT" stroke-width="6"/>
    <circle cx="200" cy="200" r="24" fill="none" stroke="ACCENT" stroke-width="6"/>
    <circle cx="192" cy="194" r="4" fill="ACCENT"/><circle cx="208" cy="194" r="4" fill="ACCENT"/><circle cx="200" cy="208" r="4" fill="ACCENT"/>`,
  "oils-sauces": `
    <path d="M186 248 V 150 h 28 v 98 a 14 14 0 0 1 -28 0 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M189 150 v -16 h 22 v 16" fill="none" stroke="ACCENT" stroke-width="6"/>
    <path d="M193 122 h 14 v 10 h -14 Z" fill="ACCENT"/>
    <path d="M158 172 q -16 36 0 72" fill="none" stroke="ACCENT" stroke-width="6" opacity="0.55"/>
    <path d="M242 172 q 16 36 0 72" fill="none" stroke="ACCENT" stroke-width="6" opacity="0.55"/>`,
  "dairy-eggs": `
    <path d="M160 118 h 80 l 8 138 a 12 12 0 0 1 -12 12 H 164 a 12 12 0 0 1 -12 -12 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M160 118 l 14 -18 h 52 l 14 18" fill="none" stroke="ACCENT" stroke-width="6"/>
    <path d="M155 196 h 90" stroke="ACCENT" stroke-width="5" opacity="0.6"/>
    <ellipse cx="200" cy="140" rx="12" ry="7" fill="ACCENT" opacity="0.65"/>`,
  beverages: `
    <path d="M176 130 h 48 v 26 l 12 12 V 250 a 12 12 0 0 1 -12 12 H 176 a 12 12 0 0 1 -12 -12 V 168 l 12 -12 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M164 196 h 72" stroke="ACCENT" stroke-width="6"/>
    <path d="M176 130 l 10 -16 h 28 l 10 16" fill="none" stroke="ACCENT" stroke-width="6"/>
    <circle cx="200" cy="226" r="9" fill="ACCENT" opacity="0.6"/>`,
  snacks: `
    <circle cx="200" cy="184" r="56" fill="none" stroke="ACCENT" stroke-width="7"/>
    <circle cx="183" cy="170" r="6" fill="ACCENT"/><circle cx="214" cy="176" r="6" fill="ACCENT"/>
    <circle cx="196" cy="202" r="6" fill="ACCENT"/><circle cx="221" cy="208" r="5" fill="ACCENT"/><circle cx="174" cy="200" r="5" fill="ACCENT"/>`,
  household: `
    <path d="M184 160 h 32 v 100 a 14 14 0 0 1 -14 14 h -4 a 14 14 0 0 1 -14 -14 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M192 160 v -20 h 16 v 20" fill="none" stroke="ACCENT" stroke-width="6"/>
    <path d="M198 116 l -4 16 h 16 l -5 -16 Z" fill="ACCENT"/>
    <path d="M152 146 l -18 -12 M 152 164 l -22 -4" stroke="ACCENT" stroke-width="5" opacity="0.5"/>`,
  "personal-care": `
    <rect x="162" y="138" width="76" height="126" rx="18" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M186 138 v -16 h 28 v 16" fill="none" stroke="ACCENT" stroke-width="6"/>
    <path d="M172 194 q 28 18 56 0" stroke="ACCENT" stroke-width="6" fill="none"/>`,
  "meat-fish": `
    <path d="M140 184 q 30 -46 74 -40 l 22 -22 v 62 l -22 -22 q -44 6 -74 22 Z" fill="none" stroke="ACCENT" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="164" cy="176" r="6" fill="ACCENT"/>
    <path d="M236 122 l 10 -12 M 236 122 l 14 4" stroke="ACCENT" stroke-width="5"/>
    <path d="M150 214 q 40 14 84 -6" stroke="ACCENT" stroke-width="5" fill="none" opacity="0.5"/>`,
  "baby-family": `
    <path d="M200 122 C 176 142 176 170 200 190 C 224 170 224 142 200 122 Z" fill="none" stroke="ACCENT" stroke-width="7"/>
    <path d="M200 190 v 46" stroke="ACCENT" stroke-width="7" stroke-linecap="round"/>
    <circle cx="200" cy="152" r="8" fill="ACCENT" opacity="0.7"/>`,
};

const PRODUCTS = [
  ["fresh-tomatoes", "fresh-produce", "Fresh Tomatoes"],
  ["red-onions", "fresh-produce", "Red Onions"],
  ["ripe-plantain", "fresh-produce", "Ripe Plantain"],
  ["pona-yam", "fresh-produce", "Pona Yam"],
  ["garden-eggs", "fresh-produce", "Garden Eggs"],
  ["fresh-okro", "fresh-produce", "Fresh Okro"],
  ["fresh-pepper", "fresh-produce", "Fresh Pepper"],
  ["sweet-bananas", "fresh-produce", "Sweet Bananas"],
  ["oranges", "fresh-produce", "Oranges"],
  ["cocoyam", "fresh-produce", "Cocoyam"],
  ["perfumed-local-rice", "grains-staples", "Perfumed Local Rice"],
  ["imported-long-grain-rice", "grains-staples", "Imported Rice"],
  ["black-eyed-beans", "grains-staples", "Black-eyed Beans"],
  ["fine-gari", "grains-staples", "Fine Gari"],
  ["dried-maize", "grains-staples", "Dried Maize"],
  ["wheat-flour", "grains-staples", "Wheat Flour"],
  ["rolled-oats", "grains-staples", "Rolled Oats"],
  ["red-palm-oil", "oils-sauces", "Red Palm Oil"],
  ["sunflower-cooking-oil", "oils-sauces", "Sunflower Oil"],
  ["tomato-paste", "oils-sauces", "Tomato Paste"],
  ["shito-sauce", "oils-sauces", "Shito Sauce"],
  ["full-cream-milk-powder", "dairy-eggs", "Milk Powder"],
  ["evaporated-milk", "dairy-eggs", "Evaporated Milk"],
  ["fresh-pasteurised-milk", "dairy-eggs", "Fresh Milk"],
  ["farm-eggs", "dairy-eggs", "Farm Eggs"],
  ["natural-yoghurt", "dairy-eggs", "Natural Yoghurt"],
  ["bottled-water", "beverages", "Bottled Water"],
  ["sachet-water", "beverages", "Sachet Water"],
  ["cola-soft-drink", "beverages", "Cola Soft Drink"],
  ["milo-cocoa-drink", "beverages", "Milo Cocoa Drink"],
  ["yellow-label-tea", "beverages", "Yellow Label Tea"],
  ["mango-juice", "beverages", "Mango Juice"],
  ["digestive-biscuits", "snacks", "Digestive Biscuits"],
  ["plantain-chips", "snacks", "Plantain Chips"],
  ["roasted-groundnuts", "snacks", "Roasted Groundnuts"],
  ["toffee-assortment", "snacks", "Toffee Assortment"],
  ["multi-purpose-dish-liquid", "household", "Dish Liquid"],
  ["laundry-soap-bar", "household", "Laundry Soap Bar"],
  ["toilet-tissue", "household", "Toilet Tissue"],
  ["safety-matches", "household", "Safety Matches"],
  ["mosquito-coil", "household", "Mosquito Coil"],
  ["floor-cleaner", "household", "Floor Cleaner"],
  ["antiseptic-soap", "personal-care", "Antiseptic Soap"],
  ["toothpaste", "personal-care", "Toothpaste"],
  ["hand-sanitiser", "personal-care", "Hand Sanitiser"],
  ["frozen-whole-chicken", "meat-fish", "Whole Chicken"],
  ["frozen-tilapia", "meat-fish", "Frozen Tilapia"],
  ["corned-beef", "meat-fish", "Corned Beef"],
  ["sardines-tomato-sauce", "meat-fish", "Sardines"],
  ["baby-wipes", "baby-family", "Baby Wipes"],
  ["baby-maize-cereal", "baby-family", "Baby Maize Cereal"],
  ["baby-diapers-size-m", "baby-family", "Baby Diapers M"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function tile(slug, category, name) {
  const t = TINTS[category] ?? TINTS.forest;
  const glyph = (GLYPHS[category] ?? GLYPHS.snacks).replaceAll("ACCENT", t.accent);
  const words = name.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 15 && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  const shown = lines.slice(0, 3);
  const fontSize = shown.length > 2 ? 24 : 28;
  const startY = 352 + (3 - shown.length) * ((fontSize + 8) / 2);
  const textBlock = shown
    .map((l, i) => `<text x="200" y="${startY + i * (fontSize + 8)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" fill="#26382A">${esc(l)}</text>`)
    .join("\n    ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" role="img" aria-label="${esc(name)} — Variety Groceries product tile">
  <rect width="400" height="440" fill="${t.bg}"/>
  <circle cx="64" cy="70" r="30" fill="${t.accent}" opacity="0.08"/>
  <circle cx="348" cy="320" r="46" fill="${t.accent}" opacity="0.08"/>
  <circle cx="352" cy="84" r="18" fill="${t.accent}" opacity="0.12"/>
  <rect x="28" y="28" width="344" height="284" rx="20" fill="#FFFFFF" opacity="0.45"/>
  ${glyph}
  ${textBlock}
</svg>
`;
}

let count = 0;
for (const [slug, category, name] of PRODUCTS) {
  writeFileSync(join(OUT, `${slug}.svg`), tile(slug, category, name));
  count++;
}
console.log(`Wrote ${count} SVG tiles to ${OUT}`);
