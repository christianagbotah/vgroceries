/**
 * Seed fixtures — catalogue: categories, suppliers, products, variants, lots.
 * All data is fictional demo data for the Ghana market. Prices are mock
 * sample prices, not commitments.
 */

import type {
  Category,
  GoodsReceipt,
  LotKind,
  Product,
  ProductVariant,
  PurchaseOrder,
  StockLot,
  Supplier,
  UnitKind,
} from "@/types/domain";
import { isoMinusDays, isoPlusDays } from "@/lib/id";

export const LOC_STORE = "loc_store";
export const LOC_BACK = "loc_backroom";
export const LOC_QUAR = "loc_quarantine";

export interface SeedLot {
  lotNumber: string;
  qty: string;
  expiryDays?: number; // relative to seed time
  kind?: LotKind;
  quarantined?: boolean;
  notes?: string;
  supplierId?: string;
  poId?: string;
  locationId?: string;
}

export interface SeedVariant {
  key: string;
  name: string;
  unit: UnitKind;
  unitSize: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  barcode?: string;
  purchase?: { altUnit: UnitKind; factor: string };
  safetyStock?: string;
  lots: SeedLot[];
}

export interface SeedProduct {
  key: string;
  slug: string;
  name: string;
  categoryKey: string;
  short: string;
  description: string;
  tags: string[];
  published?: boolean;
  variants: SeedVariant[];
}

export const seedCategories: Category[] = [
  { id: "cat_fp", slug: "fresh-produce", name: "Fresh Produce", description: "Market-fresh vegetables, fruits and roots delivered daily from our suppliers.", tint: "tomato", sortOrder: 1, isActive: true },
  { id: "cat_gs", slug: "grains-staples", name: "Grains & Staples", description: "Rice, beans, maize, flour and everyday Ghanaian staples.", tint: "gold", sortOrder: 2, isActive: true },
  { id: "cat_os", slug: "oils-sauces", name: "Oils & Sauces", description: "Cooking oils, tomato paste, shito and kitchen sauces.", tint: "amber", sortOrder: 3, isActive: true },
  { id: "cat_de", slug: "dairy-eggs", name: "Dairy & Eggs", description: "Milk, eggs, yoghurt and chilled dairy essentials.", tint: "clay", sortOrder: 4, isActive: true },
  { id: "cat_bv", slug: "beverages", name: "Beverages", description: "Water, soft drinks, tea, cocoa drinks and juices.", tint: "forest", sortOrder: 5, isActive: true },
  { id: "cat_sn", slug: "snacks", name: "Snacks & Confectionery", description: "Biscuits, chips, groundnuts and sweets.", tint: "terracotta", sortOrder: 6, isActive: true },
  { id: "cat_hh", slug: "household", name: "Household Care", description: "Cleaning, laundry and home essentials.", tint: "olive", sortOrder: 7, isActive: true },
  { id: "cat_pc", slug: "personal-care", name: "Personal Care", description: "Soap, oral care and hygiene products.", tint: "sage", sortOrder: 8, isActive: true },
  { id: "cat_mf", slug: "meat-fish", name: "Meat & Fish", description: "Frozen poultry, fish and tinned protein.", tint: "cocoa", sortOrder: 9, isActive: true },
  { id: "cat_bb", slug: "baby-family", name: "Baby & Family", description: "Baby food, wipes and care items for the family.", tint: "moss", sortOrder: 10, isActive: true },
];

export const seedSuppliers: Supplier[] = [
  { id: "sup_01", name: "Makola Wholesale Traders (demo)", phone: "+233541110101", email: "orders@makola-demo.example", notes: "Grains, oils and dry goods. Demo supplier record.", isActive: true },
  { id: "sup_02", name: "Accra Agro Foods Ltd (demo)", phone: "+233201020304", email: "sales@agrofoods-demo.example", notes: "Fresh produce supplier, morning deliveries.", isActive: true },
  { id: "sup_03", name: "Tema Cold Chain Logistics (demo)", phone: "+233303050607", email: "chill@tcc-demo.example", notes: "Frozen and chilled lines. Requires same-day sale planning.", isActive: true },
  { id: "sup_04", name: "Ghana Home Stores Distributors (demo)", phone: "+233277080901", email: "trade@ghs-demo.example", notes: "Household and personal-care brands.", isActive: true },
];

export const seedProducts: SeedProduct[] = [
  // ---------------- Fresh produce ----------------
  { key: "prd_tom", slug: "fresh-tomatoes", name: "Fresh Tomatoes", categoryKey: "cat_fp", short: "Firm market tomatoes, ideal for stews and salads.", description: "Fresh tomatoes sourced each morning from Accra wholesale markets. Sold by the kilogram; pick sizes vary with the season. Store cool and use within a few days for best results.", tags: ["tomato", "vegetable", "stew", "salad", "fresh"], published: true, variants: [
    { key: "var_tom_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1800, barcode: "6001234000011", purchase: { altUnit: "carton", factor: "20" }, lots: [
      { lotNumber: "L-TOM-231", qty: "40", expiryDays: 4, supplierId: "sup_02", notes: "Near expiry — review for promotion" },
      { lotNumber: "L-TOM-232", qty: "25", expiryDays: 9, supplierId: "sup_02" },
    ] },
  ] },
  { key: "prd_oni", slug: "red-onions", name: "Red Onions", categoryKey: "cat_fp", short: "Sharp, aromatic red onions by the kilogram.", description: "Red onions chosen for everyday Ghanaian cooking. Firm bulbs, dry skins. Sold by the kilogram.", tags: ["onion", "vegetable", "stew", "fresh"], published: true, variants: [
    { key: "var_oni_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2200, purchase: { altUnit: "bag", factor: "25" }, lots: [{ lotNumber: "L-ONI-118", qty: "60", expiryDays: 20, supplierId: "sup_02" }] },
  ] },
  { key: "prd_pla", slug: "ripe-plantain", name: "Ripe Plantain", categoryKey: "cat_fp", short: "Ripe plantain bunches ready for frying or kelewele.", description: "Ripe plantain sold as a half bunch. Great for kelewele, fried plantain or red red.", tags: ["plantain", "kelewele", "fruit", "fresh"], published: true, variants: [
    { key: "var_pla_bn", name: "Half bunch", unit: "bunch", unitSize: "1 bunch", priceMinor: 2500, lots: [{ lotNumber: "L-PLA-092", qty: "30", expiryDays: 6, supplierId: "sup_02" }] },
  ] },
  { key: "prd_yam", slug: "pona-yam", name: "Pona Yam", categoryKey: "cat_fp", short: "Premium Ghanaian pona yam tubers.", description: "Pona yam, prized for its taste and texture. Sold per tuber; sizes vary naturally.", tags: ["yam", "pona", "tuber", "fufu", "fresh"], published: true, variants: [
    { key: "var_yam_pc", name: "Per tuber", unit: "piece", unitSize: "1 tuber", priceMinor: 3000, purchase: { altUnit: "carton", factor: "18" }, lots: [{ lotNumber: "L-YAM-061", qty: "40", expiryDays: 30, supplierId: "sup_02" }] },
  ] },
  { key: "prd_geg", slug: "garden-eggs", name: "Garden Eggs", categoryKey: "cat_fp", short: "Fresh garden eggs for stews and soups.", description: "Garden eggs sold by the kilogram. A staple for light soups and stews.", tags: ["garden eggs", "eggplant", "vegetable", "stew", "fresh"], published: true, variants: [
    { key: "var_geg_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1500, lots: [{ lotNumber: "L-GEG-077", qty: "5", expiryDays: 6, supplierId: "sup_02", notes: "Low stock" }] },
  ] },
  { key: "prd_okr", slug: "fresh-okro", name: "Fresh Okro", categoryKey: "cat_fp", short: "Tender okro pods for soups and kontomire stew.", description: "Fresh okro sold by the kilogram. Best used within days of purchase.", tags: ["okro", "okra", "vegetable", "soup", "fresh"], published: true, variants: [
    { key: "var_okr_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2000, lots: [{ lotNumber: "L-OKR-044", qty: "18", expiryDays: 3, supplierId: "sup_02", notes: "Near expiry" }] },
  ] },
  { key: "prd_ppe", slug: "fresh-pepper", name: "Fresh Pepper (Tomato Mix)", categoryKey: "cat_fp", short: "Mixed fresh pepper for hot cooking.", description: "A market mix of fresh pepper varieties. Handle with care; sold by the kilogram.", tags: ["pepper", "chilli", "spicy", "vegetable", "fresh"], published: true, variants: [
    { key: "var_ppe_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2400, lots: [{ lotNumber: "L-PPE-031", qty: "12", expiryDays: 5, supplierId: "sup_02" }] },
  ] },
  { key: "prd_ban", slug: "sweet-bananas", name: "Sweet Bananas", categoryKey: "cat_fp", short: "Sweet ripe banana bunches.", description: "Locally grown sweet bananas, sold per half bunch.", tags: ["banana", "fruit", "snack", "fresh"], published: true, variants: [
    { key: "var_ban_bn", name: "Half bunch", unit: "bunch", unitSize: "1 bunch", priceMinor: 1500, lots: [{ lotNumber: "L-BAN-089", qty: "20", expiryDays: 4, supplierId: "sup_02" }] },
  ] },
  { key: "prd_org", slug: "oranges", name: "Oranges", categoryKey: "cat_fp", short: "Juicy local oranges by the kilogram.", description: "Local oranges sold by the kilogram — perfect for juice or a fresh snack.", tags: ["orange", "fruit", "juice", "fresh"], published: true, variants: [
    { key: "var_org_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1200, lots: [{ lotNumber: "L-ORG-073", qty: "35", expiryDays: 8, supplierId: "sup_02" }] },
  ] },
  { key: "prd_coc", slug: "cocoyam", name: "Cocoyam", categoryKey: "cat_fp", short: "Fresh cocoyam for fufu and boiling.", description: "Cocoyam sold by the kilogram. Firm, fresh tubers for everyday cooking.", tags: ["cocoyam", "tuber", "fufu", "fresh"], published: true, variants: [
    { key: "var_coc_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1600, lots: [{ lotNumber: "L-COC-058", qty: "25", expiryDays: 14, supplierId: "sup_02" }] },
  ] },

  // ---------------- Grains & staples ----------------
  { key: "prd_ric1", slug: "perfumed-local-rice", name: "Perfumed Local Rice", categoryKey: "cat_gs", short: "Fragrant Ghanaian-grown rice, 5 kg bag.", description: "Perfumed local rice from Ghanaian farms. Available as a single 5 kg bag or a carton of four bags for stock-ups.", tags: ["rice", "local", "grain", "staple"], published: true, variants: [
    { key: "var_ric1_5", name: "5 kg bag", unit: "bag", unitSize: "5 kg", priceMinor: 12000, compareAtPriceMinor: 13500, barcode: "6001234000028", purchase: { altUnit: "carton", factor: "4" }, lots: [{ lotNumber: "L-RIC1-012", qty: "40", expiryDays: 300, supplierId: "sup_01", poId: "po_rice" }] },
  ] },
  { key: "prd_ric2", slug: "imported-long-grain-rice", name: "Imported Long Grain Rice", categoryKey: "cat_gs", short: "Premium imported long grain rice, 5 kg bag.", description: "Long grain imported rice, steady quality for everyday cooking. 5 kg bag.", tags: ["rice", "imported", "grain", "staple"], published: true, variants: [
    { key: "var_ric2_5", name: "5 kg bag", unit: "bag", unitSize: "5 kg", priceMinor: 14500, barcode: "6001234000035", purchase: { altUnit: "carton", factor: "4" }, lots: [{ lotNumber: "L-RIC2-008", qty: "6", expiryDays: 300, supplierId: "sup_01", notes: "Low stock — replenishment suggested" }] },
  ] },
  { key: "prd_bea", slug: "black-eyed-beans", name: "Black-eyed Beans", categoryKey: "cat_gs", short: "Clean black-eyed beans by the kilogram or 2 kg pack.", description: "Black-eyed beans, sorted and clean. Buy loose by the kilogram or as a sealed 2 kg pack.", tags: ["beans", "protein", "stew", "grain"], published: true, variants: [
    { key: "var_bea_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2800, lots: [{ lotNumber: "L-BEA-021", qty: "50", expiryDays: 180, supplierId: "sup_01" }] },
    { key: "var_bea_2k", name: "2 kg pack", unit: "pack", unitSize: "2 kg", priceMinor: 5400, barcode: "6001234000042", purchase: { altUnit: "carton", factor: "10" }, lots: [{ lotNumber: "L-BEA2-021", qty: "20", expiryDays: 180, supplierId: "sup_01" }] },
  ] },
  { key: "prd_gar", slug: "fine-gari", name: "Fine Gari", categoryKey: "cat_gs", short: "Fine, dry gari from premium cassava.", description: "Fine gari sold by the kilogram. Store dry and sealed.", tags: ["gari", "cassava", "staple", "grain"], published: true, variants: [
    { key: "var_gar_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1400, purchase: { altUnit: "bag", factor: "50" }, lots: [{ lotNumber: "L-GAR-045", qty: "45", expiryDays: 120, supplierId: "sup_01" }] },
  ] },
  { key: "prd_mai", slug: "dried-maize", name: "Dried Maize", categoryKey: "cat_gs", short: "Dried maize for kenkey, porridge and milling.", description: "Dried maize sold by the kilogram. Suitable for milling or kenkey preparation.", tags: ["maize", "corn", "kenkey", "grain"], published: true, variants: [
    { key: "var_mai_kg", name: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 900, lots: [{ lotNumber: "L-MAI-067", qty: "80", expiryDays: 200, supplierId: "sup_01" }] },
  ] },
  { key: "prd_flr", slug: "wheat-flour", name: "Wheat Flour", categoryKey: "cat_gs", short: "All-purpose wheat flour for baking and pasting.", description: "All-purpose wheat flour. Available as 1 kg or 5 kg packs.", tags: ["flour", "baking", "wheat", "staple"], published: true, variants: [
    { key: "var_flr_1", name: "1 kg pack", unit: "pack", unitSize: "1 kg", priceMinor: 1600, barcode: "6001234000059", purchase: { altUnit: "carton", factor: "10" }, lots: [{ lotNumber: "L-FLR1-013", qty: "60", expiryDays: 150, supplierId: "sup_01" }] },
    { key: "var_flr_5", name: "5 kg pack", unit: "pack", unitSize: "5 kg", priceMinor: 7500, purchase: { altUnit: "carton", factor: "4" }, lots: [{ lotNumber: "L-FLR5-013", qty: "15", expiryDays: 150, supplierId: "sup_01" }] },
  ] },
  { key: "prd_oat", slug: "rolled-oats", name: "Rolled Oats", categoryKey: "cat_gs", short: "Wholegrain rolled oats, 500 g.", description: "Wholegrain rolled oats for porridge and baking. 500 g pack.", tags: ["oats", "porridge", "breakfast", "grain"], published: true, variants: [
    { key: "var_oat_500", name: "500 g pack", unit: "pack", unitSize: "500 g", priceMinor: 2200, barcode: "6001234000066", lots: [{ lotNumber: "L-OAT-027", qty: "25", expiryDays: 200, supplierId: "sup_01" }] },
  ] },

  // ---------------- Oils & sauces ----------------
  { key: "prd_pal", slug: "red-palm-oil", name: "Red Palm Oil", categoryKey: "cat_os", short: "Deep red Ghanaian palm oil, 1 litre.", description: "Traditional red palm oil, cold-pressed from Ghanaian palm fruit. 1 litre bottle.", tags: ["palm oil", "oil", "cooking", "stew"], published: true, variants: [
    { key: "var_pal_1l", name: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 3500, barcode: "6001234000073", purchase: { altUnit: "carton", factor: "12" }, lots: [{ lotNumber: "L-PAL-016", qty: "30", expiryDays: 365, supplierId: "sup_01" }] },
  ] },
  { key: "prd_sun", slug: "sunflower-cooking-oil", name: "Sunflower Cooking Oil", categoryKey: "cat_os", short: "Light sunflower oil, 1 litre or 5 litre.", description: "Sunflower cooking oil for frying and everyday cooking. Choose the 1 litre bottle or the 5 litre jerrycan.", tags: ["sunflower", "oil", "cooking", "frying"], published: true, variants: [
    { key: "var_sun_1l", name: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 4200, barcode: "6001234000080", purchase: { altUnit: "carton", factor: "12" }, lots: [{ lotNumber: "L-SUN1-018", qty: "28", expiryDays: 365, supplierId: "sup_01", poId: "po_oil" }] },
    { key: "var_sun_5l", name: "5 litre", unit: "litre", unitSize: "5 L", priceMinor: 19500, lots: [{ lotNumber: "L-SUN5-018", qty: "6", expiryDays: 365, supplierId: "sup_01", poId: "po_oil", notes: "Low stock" }] },
  ] },
  { key: "prd_tpa", slug: "tomato-paste", name: "Tomato Paste", categoryKey: "cat_os", short: "Thick tomato paste tins and catering packs.", description: "Rich tomato paste for stews and jollof. 400 g tins or a pack of twelve.", tags: ["tomato paste", "tin", "stew", "jollof", "sauce"], published: true, variants: [
    { key: "var_tpa_400", name: "400 g tin", unit: "piece", unitSize: "400 g", priceMinor: 800, barcode: "6001234000097", purchase: { altUnit: "carton", factor: "24" }, lots: [{ lotNumber: "L-TPA-400", qty: "120", expiryDays: 540, supplierId: "sup_01" }] },
    { key: "var_tpa_pk", name: "Pack of 12 tins", unit: "pack", unitSize: "12 × 400 g", priceMinor: 9000, purchase: { altUnit: "carton", factor: "2" }, lots: [{ lotNumber: "L-TPA-PK", qty: "10", expiryDays: 540, supplierId: "sup_01" }] },
  ] },
  { key: "prd_shi", slug: "shito-sauce", name: "Shito Sauce", categoryKey: "cat_os", short: "Homestyle black pepper sauce, 330 g jar.", description: "Traditional shito hot pepper sauce made with dried fish and spices. 330 g jar. Refrigerate after opening.", tags: ["shito", "pepper sauce", "hot", "condiment"], published: true, variants: [
    { key: "var_shi_330", name: "330 g jar", unit: "piece", unitSize: "330 g", priceMinor: 2500, barcode: "6001234000103", lots: [
      { lotNumber: "L-SHI-A", qty: "16", expiryDays: 30, supplierId: "sup_01" },
      { lotNumber: "L-SHI-B", qty: "4", expiryDays: -2, supplierId: "sup_01", notes: "Expired — withdraw from sale" },
    ] },
  ] },

  // ---------------- Dairy & eggs ----------------
  { key: "prd_mlk", slug: "full-cream-milk-powder", name: "Full Cream Milk Powder", categoryKey: "cat_de", short: "Full cream milk powder, 400 g tin.", description: "Full cream milk powder for tea, porridge and baking. 400 g sealed tin.", tags: ["milk", "powder", "dairy", "tea"], published: true, variants: [
    { key: "var_mlk_400", name: "400 g tin", unit: "piece", unitSize: "400 g", priceMinor: 3800, barcode: "6001234000110", purchase: { altUnit: "carton", factor: "24" }, lots: [{ lotNumber: "L-MLK-400", qty: "30", expiryDays: 365, supplierId: "sup_01" }] },
  ] },
  { key: "prd_evm", slug: "evaporated-milk", name: "Evaporated Milk", categoryKey: "cat_de", short: "Creamy evaporated milk tins.", description: "Evaporated milk for tea, coffee and desserts. Single 160 g tin or a counter pack.", tags: ["milk", "evaporated", "dairy", "tea", "coffee"], published: true, variants: [
    { key: "var_evm_160", name: "160 g tin", unit: "piece", unitSize: "160 g", priceMinor: 700, barcode: "6001234000127", purchase: { altUnit: "carton", factor: "48" }, lots: [{ lotNumber: "L-EVM-160", qty: "80", expiryDays: 365, supplierId: "sup_01" }] },
    { key: "var_evm_pk", name: "Pack of 48 tins", unit: "pack", unitSize: "48 × 160 g", priceMinor: 32000, lots: [{ lotNumber: "L-EVM-PK", qty: "4", expiryDays: 365, supplierId: "sup_01" }] },
  ] },
  { key: "prd_fml", slug: "fresh-pasteurised-milk", name: "Fresh Pasteurised Milk", categoryKey: "cat_de", short: "Chilled fresh milk, 1 litre.", description: "Fresh pasteurised milk kept chilled in-store. Best consumed within three days of purchase.", tags: ["milk", "fresh", "chilled", "dairy"], published: true, variants: [
    { key: "var_fml_1l", name: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 1800, lots: [
      { lotNumber: "L-FML-A", qty: "12", expiryDays: 2, supplierId: "sup_03", notes: "Near expiry" },
      { lotNumber: "L-FML-B", qty: "6", expiryDays: -1, supplierId: "sup_03", notes: "Expired — unsellable" },
    ] },
  ] },
  { key: "prd_egg", slug: "farm-eggs", name: "Farm Eggs", categoryKey: "cat_de", short: "Fresh farm eggs in packs of 30 or 15.", description: "Fresh farm eggs from Ghanaian poultry farms. Full tray of 30 or a half pack of 15.", tags: ["eggs", "protein", "breakfast", "dairy"], published: true, variants: [
    { key: "var_egg_30", name: "Pack of 30", unit: "pack", unitSize: "30 eggs", priceMinor: 4200, barcode: "6001234000134", purchase: { altUnit: "carton", factor: "12" }, safetyStock: "2", lots: [{ lotNumber: "L-EGG-30", qty: "20", expiryDays: 10, supplierId: "sup_02" }] },
    { key: "var_egg_15", name: "Half pack of 15", unit: "pack", unitSize: "15 eggs", priceMinor: 2300, lots: [{ lotNumber: "L-EGG-15", qty: "8", expiryDays: 10, supplierId: "sup_02" }] },
  ] },
  { key: "prd_yog", slug: "natural-yoghurt", name: "Natural Yoghurt", categoryKey: "cat_de", short: "Plain natural yoghurt, 500 g.", description: "Plain set yoghurt, lightly sweetened. Keep chilled. 500 g tub.", tags: ["yoghurt", "dairy", "chilled", "breakfast"], published: true, variants: [
    { key: "var_yog_500", name: "500 g tub", unit: "piece", unitSize: "500 g", priceMinor: 2000, barcode: "6001234000141", purchase: { altUnit: "pack", factor: "8" }, lots: [
      { lotNumber: "L-YOG-500", qty: "24", expiryDays: 7, supplierId: "sup_03" },
      { lotNumber: "L-YOG-RET", qty: "2", expiryDays: 7, kind: "returns_quarantine", quarantined: true, notes: "Customer return — awaiting inspection", locationId: LOC_QUAR },
    ] },
  ] },

  // ---------------- Beverages ----------------
  { key: "prd_wat", slug: "bottled-water", name: "Bottled Water", categoryKey: "cat_bv", short: "Still bottled water, 750 ml or pack of 15.", description: "Clean still water in 750 ml bottles. Single bottles or a shrink-wrapped pack of fifteen.", tags: ["water", "drink", "hydration"], published: true, variants: [
    { key: "var_wat_750", name: "750 ml bottle", unit: "piece", unitSize: "750 ml", priceMinor: 300, barcode: "6001234000158", purchase: { altUnit: "pack", factor: "15" }, lots: [{ lotNumber: "L-WAT-750", qty: "90", expiryDays: 540, supplierId: "sup_01" }] },
    { key: "var_wat_pk", name: "Pack of 15 bottles", unit: "pack", unitSize: "15 × 750 ml", priceMinor: 4000, barcode: "6001234000165", lots: [{ lotNumber: "L-WAT-PK", qty: "30", expiryDays: 540, supplierId: "sup_01" }] },
  ] },
  { key: "prd_swt", slug: "sachet-water", name: "Sachet Water", categoryKey: "cat_bv", short: "Pack of 30 pure water sachets.", description: "Pack of thirty 500 ml water sachets, chilled on request.", tags: ["water", "sachet", "drink", "hydration"], published: true, variants: [
    { key: "var_swt_pk", name: "Pack of 30 sachets", unit: "pack", unitSize: "30 × 500 ml", priceMinor: 1000, barcode: "6001234000172", lots: [{ lotNumber: "L-SWT-030", qty: "0", expiryDays: 540, supplierId: "sup_01", notes: "Sold out — hidden from storefront" }] },
  ] },
  { key: "prd_cok", slug: "cola-soft-drink", name: "Cola Soft Drink", categoryKey: "cat_bv", short: "Chilled cola in 300 ml bottles.", description: "Cola soft drink, served chilled. Single 300 ml bottle or a pack of twelve.", tags: ["cola", "soft drink", "chilled", "drink"], published: true, variants: [
    { key: "var_cok_300", name: "300 ml bottle", unit: "piece", unitSize: "300 ml", priceMinor: 500, barcode: "6001234000189", purchase: { altUnit: "pack", factor: "12" }, lots: [{ lotNumber: "L-COK-300", qty: "96", expiryDays: 180, supplierId: "sup_01" }] },
    { key: "var_cok_pk", name: "Pack of 12 bottles", unit: "pack", unitSize: "12 × 300 ml", priceMinor: 5500, lots: [{ lotNumber: "L-COK-PK", qty: "12", expiryDays: 180, supplierId: "sup_01" }] },
  ] },
  { key: "prd_mil", slug: "milo-cocoa-drink", name: "Milo Cocoa Drink Tin", categoryKey: "cat_bv", short: "Malted cocoa drink tin, 400 g.", description: "Malted cocoa drink for hot and cold beverages. 400 g tin.", tags: ["milo", "cocoa", "beverage", "breakfast", "tea"], published: true, variants: [
    { key: "var_mil_400", name: "400 g tin", unit: "piece", unitSize: "400 g", priceMinor: 5200, compareAtPriceMinor: 5800, barcode: "6001234000196", purchase: { altUnit: "carton", factor: "12" }, lots: [
      { lotNumber: "L-MIL-A", qty: "18", expiryDays: 5, supplierId: "sup_01", notes: "Near expiry — promotion review suggested" },
      { lotNumber: "L-MIL-B", qty: "22", expiryDays: 120, supplierId: "sup_01" },
    ] },
  ] },
  { key: "prd_lip", slug: "yellow-label-tea", name: "Yellow Label Tea", categoryKey: "cat_bv", short: "Black tea bags, pack of 25.", description: "Classic yellow label black tea bags. Pack of twenty-five teabags.", tags: ["tea", "lipton", "breakfast", "drink"], published: true, variants: [
    { key: "var_lip_25", name: "Pack of 25 bags", unit: "pack", unitSize: "25 bags", priceMinor: 1200, barcode: "6001234000202", purchase: { altUnit: "carton", factor: "24" }, lots: [{ lotNumber: "L-LIP-025", qty: "40", expiryDays: 540, supplierId: "sup_01" }] },
  ] },
  { key: "prd_man", slug: "mango-juice", name: "Mango Juice", categoryKey: "cat_bv", short: "Chilled mango juice, 1 litre.", description: "Mango juice made from Ghanaian mangoes. Keep chilled; shake before serving.", tags: ["mango", "juice", "chilled", "drink"], published: true, variants: [
    { key: "var_man_1l", name: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 2500, barcode: "6001234000219", lots: [{ lotNumber: "L-MAN-1L", qty: "18", expiryDays: 3, supplierId: "sup_03", notes: "Near expiry" }] },
  ] },

  // ---------------- Snacks ----------------
  { key: "prd_dig", slug: "digestive-biscuits", name: "Digestive Biscuits", categoryKey: "cat_sn", short: "Wholewheat digestive biscuits.", description: "Wholewheat digestive biscuits, ideal with tea. Sold per pack.", tags: ["biscuit", "snack", "tea"], published: true, variants: [
    { key: "var_dig_pk", name: "Single pack", unit: "pack", unitSize: "250 g", priceMinor: 800, barcode: "6001234000226", purchase: { altUnit: "carton", factor: "24" }, lots: [
      { lotNumber: "L-DIG-A", qty: "55", expiryDays: 180, supplierId: "sup_01" },
      { lotNumber: "L-DIG-DMG", qty: "8", expiryDays: 180, kind: "damaged", notes: "Crushed carton — damaged stock", locationId: LOC_BACK },
    ] },
  ] },
  { key: "prd_plc", slug: "plantain-chips", name: "Plantain Chips (Salted)", categoryKey: "cat_sn", short: "Crispy salted plantain chips, 100 g.", description: "Crispy fried plantain chips lightly salted. A favourite grab-and-go snack. 100 g pack.", tags: ["plantain chips", "snack", "crisps"], published: true, variants: [
    { key: "var_plc_100", name: "100 g pack", unit: "pack", unitSize: "100 g", priceMinor: 500, barcode: "6001234000233", purchase: { altUnit: "carton", factor: "50" }, lots: [{ lotNumber: "L-PLC-100", qty: "70", expiryDays: 30, supplierId: "sup_01" }] },
  ] },
  { key: "prd_grn", slug: "roasted-groundnuts", name: "Roasted Groundnuts", categoryKey: "cat_sn", short: "Roasted groundnuts, 400 g.", description: "Dry-roasted groundnuts, unsalted. 400 g pack.", tags: ["groundnut", "peanut", "snack", "protein"], published: true, variants: [
    { key: "var_grn_400", name: "400 g pack", unit: "pack", unitSize: "400 g", priceMinor: 1500, barcode: "6001234000240", lots: [{ lotNumber: "L-GRN-400", qty: "40", expiryDays: 90, supplierId: "sup_01" }] },
  ] },
  { key: "prd_tof", slug: "toffee-assortment", name: "Toffee Assortment", categoryKey: "cat_sn", short: "Individual toffee sweets.", description: "Classic chewy toffees sold individually — ideal for children and quick treats.", tags: ["toffee", "sweet", "candy"], published: true, variants: [
    { key: "var_tof_1", name: "Single toffee", unit: "piece", unitSize: "1 piece", priceMinor: 100, barcode: "6001234000257", purchase: { altUnit: "pack", factor: "60" }, lots: [{ lotNumber: "L-TOF-001", qty: "200", expiryDays: 365, supplierId: "sup_01" }] },
  ] },

  // ---------------- Household ----------------
  { key: "prd_dsh", slug: "multi-purpose-dish-liquid", name: "Multi-purpose Dish Liquid", categoryKey: "cat_hh", short: "Lemon dishwashing liquid, 500 ml.", description: "Lemon-scented dishwashing liquid that cuts grease. 500 ml bottle.", tags: ["dish", "washing", "cleaning", "kitchen"], published: true, variants: [
    { key: "var_dsh_500", name: "500 ml bottle", unit: "piece", unitSize: "500 ml", priceMinor: 1800, barcode: "6001234000264", purchase: { altUnit: "carton", factor: "12" }, lots: [{ lotNumber: "L-DSH-500", qty: "25", expiryDays: 720, supplierId: "sup_04" }] },
  ] },
  { key: "prd_lsy", slug: "laundry-soap-bar", name: "Laundry Soap Bar", categoryKey: "cat_hh", short: "Hardworking laundry soap bars.", description: "Classic laundry soap bars for hand washing. Single bars or a pack of ten.", tags: ["soap", "laundry", "washing", "cleaning"], published: true, variants: [
    { key: "var_lsy_1", name: "Single bar", unit: "piece", unitSize: "1 bar", priceMinor: 600, barcode: "6001234000271", purchase: { altUnit: "pack", factor: "10" }, lots: [{ lotNumber: "L-LSY-001", qty: "60", expiryDays: 540, supplierId: "sup_04" }] },
    { key: "var_lsy_10", name: "Pack of 10 bars", unit: "pack", unitSize: "10 bars", priceMinor: 5500, lots: [{ lotNumber: "L-LSY-010", qty: "8", expiryDays: 540, supplierId: "sup_04" }] },
  ] },
  { key: "prd_tis", slug: "toilet-tissue", name: "Toilet Tissue", categoryKey: "cat_hh", short: "Soft toilet tissue rolls and packs.", description: "Two-ply toilet tissue. Single rolls or an economical pack of ten.", tags: ["tissue", "toilet", "paper", "bathroom"], published: true, variants: [
    { key: "var_tis_1", name: "Single roll", unit: "piece", unitSize: "1 roll", priceMinor: 450, barcode: "6001234000288", purchase: { altUnit: "pack", factor: "10" }, lots: [{ lotNumber: "L-TIS-001", qty: "100", expiryDays: 999, supplierId: "sup_04" }] },
    { key: "var_tis_10", name: "Pack of 10 rolls", unit: "pack", unitSize: "10 rolls", priceMinor: 4200, barcode: "6001234000295", lots: [{ lotNumber: "L-TIS-010", qty: "15", expiryDays: 999, supplierId: "sup_04" }] },
  ] },
  { key: "prd_mat", slug: "safety-matches", name: "Safety Matches", categoryKey: "cat_hh", short: "Boxes of safety matches.", description: "Reliable safety matches for the kitchen. Single box.", tags: ["matches", "fire", "kitchen"], published: true, variants: [
    { key: "var_mat_1", name: "Single box", unit: "piece", unitSize: "1 box", priceMinor: 100, barcode: "6001234000301", purchase: { altUnit: "pack", factor: "10" }, lots: [{ lotNumber: "L-MAT-001", qty: "150", expiryDays: 999, supplierId: "sup_04" }] },
  ] },
  { key: "prd_mos", slug: "mosquito-coil", name: "Mosquito Coil", categoryKey: "cat_hh", short: "Mosquito repellent coils.", description: "Slow-burning mosquito coils for evening protection. Pack of ten coils.", tags: ["mosquito", "coil", "repellent", "protection"], published: true, variants: [
    { key: "var_mos_pk", name: "Pack of 10 coils", unit: "pack", unitSize: "10 coils", priceMinor: 800, barcode: "6001234000318", lots: [{ lotNumber: "L-MOS-010", qty: "35", expiryDays: 999, supplierId: "sup_04" }] },
  ] },
  { key: "prd_fcl", slug: "floor-cleaner", name: "Floor Cleaner", categoryKey: "cat_hh", short: "Disinfectant floor cleaner, 1 litre.", description: "Pine-scented disinfectant floor cleaner. 1 litre bottle.", tags: ["floor", "cleaner", "disinfectant", "cleaning"], published: true, variants: [
    { key: "var_fcl_1l", name: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 2800, barcode: "6001234000325", lots: [{ lotNumber: "L-FCL-001", qty: "20", expiryDays: 720, supplierId: "sup_04" }] },
  ] },

  // ---------------- Personal care ----------------
  { key: "prd_ans", slug: "antiseptic-soap", name: "Antiseptic Soap", categoryKey: "cat_pc", short: "Medicated antiseptic soap, 125 g.", description: "Medicated antiseptic soap for daily hygiene. 125 g bar.", tags: ["soap", "antiseptic", "hygiene", "bath"], published: true, variants: [
    { key: "var_ans_125", name: "125 g bar", unit: "piece", unitSize: "125 g", priceMinor: 700, barcode: "6001234000332", purchase: { altUnit: "pack", factor: "12" }, lots: [{ lotNumber: "L-ANS-125", qty: "45", expiryDays: 540, supplierId: "sup_04" }] },
  ] },
  { key: "prd_tth", slug: "toothpaste", name: "Toothpaste", categoryKey: "cat_pc", short: "Fluoride toothpaste, 130 g.", description: "Cavity-protection fluoride toothpaste. 130 g tube.", tags: ["toothpaste", "oral", "dental", "hygiene"], published: true, variants: [
    { key: "var_tth_130", name: "130 g tube", unit: "piece", unitSize: "130 g", priceMinor: 1400, barcode: "6001234000349", purchase: { altUnit: "pack", factor: "12" }, lots: [{ lotNumber: "L-TTH-130", qty: "38", expiryDays: 540, supplierId: "sup_04" }] },
  ] },
  { key: "prd_san", slug: "hand-sanitiser", name: "Hand Sanitiser", categoryKey: "cat_pc", short: "Alcohol hand sanitiser gel, 100 ml.", description: "Pocket-size alcohol-based hand sanitiser gel. 100 ml bottle.", tags: ["sanitiser", "hand", "hygiene", "gel"], published: true, variants: [
    { key: "var_san_100", name: "100 ml bottle", unit: "piece", unitSize: "100 ml", priceMinor: 1200, barcode: "6001234000356", lots: [{ lotNumber: "L-SAN-100", qty: "22", expiryDays: 720, supplierId: "sup_04" }] },
  ] },

  // ---------------- Meat & fish ----------------
  { key: "prd_chk", slug: "frozen-whole-chicken", name: "Frozen Whole Chicken", categoryKey: "cat_mf", short: "Frozen whole chicken, approximately 1.1 kg.", description: "Frozen whole chicken kept at −18 °C. Priced per bird; approximate weight 1.1 kg.", tags: ["chicken", "poultry", "frozen", "protein"], published: true, variants: [
    { key: "var_chk_pc", name: "Per chicken (~1.1 kg)", unit: "piece", unitSize: "~1.1 kg", priceMinor: 5500, barcode: "6001234000363", safetyStock: "1", lots: [
      { lotNumber: "L-CHK-A", qty: "1", expiryDays: 60, supplierId: "sup_03", notes: "Final unit — reservation conflict demo" },
      { lotNumber: "L-CHK-B", qty: "1", expiryDays: 60, supplierId: "sup_03", kind: "damaged", notes: "Torn packaging — damaged, unsellable", locationId: LOC_BACK },
    ] },
  ] },
  { key: "prd_til", slug: "frozen-tilapia", name: "Frozen Tilapia", categoryKey: "cat_mf", short: "Frozen whole tilapia, per fish.", description: "Individually frozen whole tilapia. Priced per fish.", tags: ["tilapia", "fish", "frozen", "protein"], published: true, variants: [
    { key: "var_til_pc", name: "Per fish", unit: "piece", unitSize: "1 fish", priceMinor: 1800, barcode: "6001234000370", lots: [{ lotNumber: "L-TIL-001", qty: "14", expiryDays: 90, supplierId: "sup_03" }] },
  ] },
  { key: "prd_cor", slug: "corned-beef", name: "Corned Beef", categoryKey: "cat_mf", short: "Tinned corned beef, 340 g.", description: "Tinned corned beef for sandwiches, stews and rice dishes. 340 g tin.", tags: ["corned beef", "tin", "protein", "spread"], published: true, variants: [
    { key: "var_cor_340", name: "340 g tin", unit: "piece", unitSize: "340 g", priceMinor: 2200, barcode: "6001234000387", purchase: { altUnit: "carton", factor: "24" }, lots: [{ lotNumber: "L-COR-340", qty: "30", expiryDays: 365, supplierId: "sup_01" }] },
  ] },
  { key: "prd_sar", slug: "sardines-tomato-sauce", name: "Sardines in Tomato Sauce", categoryKey: "cat_mf", short: "Tinned sardines, 125 g.", description: "Sardines in tomato sauce. 125 g tin.", tags: ["sardines", "fish", "tin", "protein"], published: true, variants: [
    { key: "var_sar_125", name: "125 g tin", unit: "piece", unitSize: "125 g", priceMinor: 900, barcode: "6001234000394", purchase: { altUnit: "carton", factor: "50" }, lots: [{ lotNumber: "L-SAR-125", qty: "60", expiryDays: 365, supplierId: "sup_01" }] },
  ] },

  // ---------------- Baby & family ----------------
  { key: "prd_wip", slug: "baby-wipes", name: "Baby Wipes", categoryKey: "cat_bb", short: "Fragrance-free baby wipes, pack of 80.", description: "Soft fragrance-free baby wipes. Pack of eighty sheets.", tags: ["baby", "wipes", "care", "family"], published: true, variants: [
    { key: "var_wip_80", name: "Pack of 80 wipes", unit: "pack", unitSize: "80 wipes", priceMinor: 2500, barcode: "6001234000400", purchase: { altUnit: "carton", factor: "12" }, lots: [{ lotNumber: "L-WIP-080", qty: "15", expiryDays: 540, supplierId: "sup_04" }] },
  ] },
  { key: "prd_cer", slug: "baby-maize-cereal", name: "Baby Maize Cereal", categoryKey: "cat_bb", short: "Infant maize cereal, 400 g.", description: "Fortified maize cereal for infants from six months. 400 g tin.", tags: ["baby", "cereal", "infant", "weaning"], published: true, variants: [
    { key: "var_cer_400", name: "400 g tin", unit: "piece", unitSize: "400 g", priceMinor: 4500, barcode: "6001234000417", purchase: { altUnit: "carton", factor: "12" }, lots: [{ lotNumber: "L-CER-400", qty: "10", expiryDays: 200, supplierId: "sup_01" }] },
  ] },
  { key: "prd_dia", slug: "baby-diapers-size-m", name: "Baby Diapers (Size M)", categoryKey: "cat_bb", short: "Disposable diapers, size M, 36 pieces.", description: "Disposable baby diapers in size M. Pack of thirty-six nappies.", tags: ["baby", "diapers", "nappies", "family"], published: true, variants: [
    { key: "var_dia_m36", name: "Size M, pack of 36", unit: "pack", unitSize: "36 diapers", priceMinor: 9500, barcode: "6001234000424", lots: [{ lotNumber: "L-DIA-M36", qty: "2", expiryDays: 999, supplierId: "sup_04", notes: "Low stock — replenishment suggested" }] },
  ] },
];

export interface BuiltCatalog {
  products: Product[];
  variants: ProductVariant[];
  lots: StockLot[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
}

export function buildCatalog(now: Date): BuiltCatalog {
  const products: Product[] = [];
  const variants: ProductVariant[] = [];
  const lots: StockLot[] = [];

  for (const p of seedProducts) {
    const productId = p.key;
    const variantIds: string[] = [];
    for (const v of p.variants) {
      const variantId = v.key;
      variantIds.push(variantId);
      variants.push({
        id: variantId,
        productId,
        name: v.name,
        unit: v.unit,
        unitSize: v.unitSize,
        priceMinor: v.priceMinor,
        compareAtPriceMinor: v.compareAtPriceMinor,
        barcode: v.barcode,
        purchaseUnit: v.purchase
          ? { id: `uc_${variantId}`, baseUnit: v.unit, altUnit: v.purchase.altUnit, factor: v.purchase.factor }
          : undefined,
        safetyStock: v.safetyStock ?? "0",
        isActive: true,
      });
      for (const l of v.lots) {
        lots.push({
          id: `lot_${l.lotNumber.toLowerCase().replace(/-/g, "_")}`,
          variantId,
          locationId: l.locationId ?? LOC_STORE,
          lotNumber: l.lotNumber,
          kind: l.kind ?? "regular",
          quantity: l.qty,
          receivedAt: isoMinusDays(3),
          expiryDate:
            l.expiryDays === undefined ? undefined : isoPlusDays(l.expiryDays),
          supplierId: l.supplierId,
          purchaseOrderId: l.poId,
          isQuarantined: l.quarantined ?? false,
          notes: l.notes,
        });
      }
    }
    products.push({
      id: productId,
      slug: p.slug,
      name: p.name,
      categoryId: p.categoryKey,
      shortDescription: p.short,
      description: p.description,
      tags: p.tags,
      variants: variantIds,
      isPublished: p.published ?? true,
      createdAt: isoMinusDays(120),
      updatedAt: isoMinusDays(2),
    });
  }

  const purchaseOrders: PurchaseOrder[] = [
    {
      id: "po_rice",
      reference: "PO-0007",
      supplierId: "sup_01",
      status: "sent",
      lines: [
        { variantId: "var_ric1_5", quantity: "20", unitCostMinor: 10200 },
        { variantId: "var_ric2_5", quantity: "12", unitCostMinor: 12400 },
      ],
      expectedAt: isoPlusDays(3),
      createdAt: isoMinusDays(2),
      note: "Weekly grain replenishment. Draft suggested by the replenishment assistant.",
    },
    {
      id: "po_oil",
      reference: "PO-0008",
      supplierId: "sup_01",
      status: "partially_received",
      lines: [
        { variantId: "var_sun_1l", quantity: "36", unitCostMinor: 35500 / 10 },
        { variantId: "var_sun_5l", quantity: "10", unitCostMinor: 16800 },
      ],
      expectedAt: isoMinusDays(1),
      createdAt: isoMinusDays(6),
      note: "Carton of 5 L jerrycans still outstanding.",
    },
    {
      id: "po_chill",
      reference: "PO-0009",
      supplierId: "sup_03",
      status: "received",
      lines: [{ variantId: "var_fml_1l", quantity: "18", unitCostMinor: 1450 }],
      expectedAt: isoMinusDays(1),
      createdAt: isoMinusDays(4),
    },
  ];

  const goodsReceipts: GoodsReceipt[] = [
    {
      id: "gr_001",
      purchaseOrderId: "po_oil",
      supplierId: "sup_01",
      lines: [{ variantId: "var_sun_1l", lotNumber: "L-SUN1-018", quantity: "28", expiryDate: isoPlusDays(365) }],
      receivedAt: isoMinusDays(1),
      receivedBy: "stf_nana",
      note: "Part of PO-0008; 5 L line outstanding.",
    },
    {
      id: "gr_002",
      purchaseOrderId: "po_chill",
      supplierId: "sup_03",
      lines: [{ variantId: "var_fml_1l", lotNumber: "L-FML-A", quantity: "12", expiryDate: isoPlusDays(2) }],
      receivedAt: isoMinusDays(1),
      receivedBy: "stf_nana",
    },
  ];

  return { products, variants, lots, purchaseOrders, goodsReceipts };
}
