import { randomUUID } from "node:crypto";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

type UatCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tint: string;
  sortOrder: number;
};

type UatProduct = {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  image: string;
  tags: string[];
  variantId: string;
  sku: string;
  variantName: string;
  unit: string;
  unitSize: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  stock: string;
};

const CONFIRM_TOKEN = "variety-uat-catalog-v1";
const REQUIRED_DATABASE = "lightworld_variety_uat";
const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=84`;

const categories: UatCategory[] = [
  { id: "uat_cat_fp", slug: "fresh-produce", name: "Fresh Produce", description: "Fresh vegetables, fruits and roots for everyday Ghanaian cooking.", tint: "tomato", sortOrder: 1 },
  { id: "uat_cat_gs", slug: "grains-staples", name: "Grains & Staples", description: "Rice, beans, gari, flour and pantry staples.", tint: "gold", sortOrder: 2 },
  { id: "uat_cat_os", slug: "oils-sauces", name: "Oils & Sauces", description: "Cooking oils, tomato paste and kitchen sauces.", tint: "amber", sortOrder: 3 },
  { id: "uat_cat_de", slug: "dairy-eggs", name: "Dairy & Eggs", description: "Milk, eggs and chilled dairy essentials.", tint: "clay", sortOrder: 4 },
  { id: "uat_cat_bv", slug: "beverages", name: "Beverages", description: "Water, tea and refreshing juice selections.", tint: "forest", sortOrder: 5 },
  { id: "uat_cat_sn", slug: "snacks", name: "Snacks & Confectionery", description: "Biscuits, chips and roasted snacks.", tint: "terracotta", sortOrder: 6 },
  { id: "uat_cat_hh", slug: "household", name: "Household Care", description: "Cleaning, laundry and home essentials.", tint: "olive", sortOrder: 7 },
  { id: "uat_cat_pc", slug: "personal-care", name: "Personal Care", description: "Everyday hygiene and personal-care essentials.", tint: "sage", sortOrder: 8 },
  { id: "uat_cat_mf", slug: "meat-fish", name: "Meat & Fish", description: "Frozen poultry, fish and pantry protein.", tint: "cocoa", sortOrder: 9 },
  { id: "uat_cat_bb", slug: "baby-family", name: "Baby & Family", description: "Gentle baby and family-care essentials.", tint: "moss", sortOrder: 10 },
];

const products: UatProduct[] = [
  { id: "uat_prd_tom", slug: "fresh-tomatoes", name: "Fresh Tomatoes", categorySlug: "fresh-produce", shortDescription: "Firm market tomatoes for stews and salads.", description: "Fresh UAT grocery fixture representing locally sourced market tomatoes.", image: photo("1546094096-0df4bcaaa337"), tags: ["uat-preview", "fresh", "vegetable"], variantId: "uat_var_tom", sku: "UAT-TOMATO-KG", variantName: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1800, stock: "48" },
  { id: "uat_prd_oni", slug: "red-onions", name: "Red Onions", categorySlug: "fresh-produce", shortDescription: "Aromatic red onions sold by weight.", description: "Generic UAT red onions for rich storefront testing.", image: photo("1540420773420-3366772f4999"), tags: ["uat-preview", "fresh", "vegetable"], variantId: "uat_var_oni", sku: "UAT-ONION-KG", variantName: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2200, stock: "55" },
  { id: "uat_prd_pla", slug: "ripe-plantain", name: "Ripe Plantain", categorySlug: "fresh-produce", shortDescription: "Ripe plantain ready for frying or kelewele.", description: "Generic UAT ripe plantain grocery fixture.", image: photo("1603833665858-e61d17a86224"), tags: ["uat-preview", "fresh", "plantain"], variantId: "uat_var_pla", sku: "UAT-PLANTAIN-BN", variantName: "Half bunch", unit: "bunch", unitSize: "1 bunch", priceMinor: 2500, compareAtPriceMinor: 2800, stock: "32" },
  { id: "uat_prd_ban", slug: "sweet-bananas", name: "Sweet Bananas", categorySlug: "fresh-produce", shortDescription: "Sweet ripe bananas for snacks and breakfast.", description: "Generic UAT banana grocery fixture.", image: photo("1603833665858-e61d17a86224"), tags: ["uat-preview", "fruit", "fresh"], variantId: "uat_var_ban", sku: "UAT-BANANA-BN", variantName: "Half bunch", unit: "bunch", unitSize: "1 bunch", priceMinor: 1500, stock: "38" },

  { id: "uat_prd_ric", slug: "perfumed-local-rice", name: "Perfumed Local Rice", categorySlug: "grains-staples", shortDescription: "Fragrant Ghanaian-style rice for family meals.", description: "Generic UAT local rice fixture; sample price only.", image: photo("1536304993881-ff6e9eefa2a6"), tags: ["uat-preview", "rice", "staple"], variantId: "uat_var_ric", sku: "UAT-RICE-5KG", variantName: "5 kg bag", unit: "bag", unitSize: "5 kg", priceMinor: 12000, compareAtPriceMinor: 13500, stock: "24" },
  { id: "uat_prd_bea", slug: "black-eyed-beans", name: "Black-eyed Beans", categorySlug: "grains-staples", shortDescription: "Clean black-eyed beans for stews and waakye.", description: "Generic UAT bean fixture for storefront demonstration.", image: photo("1515543904379-3d757afe72e4"), tags: ["uat-preview", "beans", "staple"], variantId: "uat_var_bea", sku: "UAT-BEANS-KG", variantName: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 2800, stock: "46" },
  { id: "uat_prd_gar", slug: "fine-gari", name: "Fine Gari", categorySlug: "grains-staples", shortDescription: "Fine dry gari for everyday meals.", description: "Generic UAT gari fixture for storefront demonstration.", image: photo("1536304993881-ff6e9eefa2a6"), tags: ["uat-preview", "gari", "staple"], variantId: "uat_var_gar", sku: "UAT-GARI-KG", variantName: "Per kilogram", unit: "kg", unitSize: "1 kg", priceMinor: 1400, stock: "60" },

  { id: "uat_prd_pal", slug: "red-palm-oil", name: "Red Palm Oil", categorySlug: "oils-sauces", shortDescription: "Traditional red palm oil for soups and stews.", description: "Generic UAT palm-oil fixture; no brand claim.", image: photo("1474979266404-7eaacbcd87c5"), tags: ["uat-preview", "oil", "cooking"], variantId: "uat_var_pal", sku: "UAT-PALMOIL-1L", variantName: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 3500, stock: "30" },
  { id: "uat_prd_sun", slug: "sunflower-cooking-oil", name: "Sunflower Cooking Oil", categorySlug: "oils-sauces", shortDescription: "Light cooking oil for frying and everyday meals.", description: "Generic UAT sunflower-oil fixture; no brand claim.", image: photo("1474979266404-7eaacbcd87c5"), tags: ["uat-preview", "oil", "cooking"], variantId: "uat_var_sun", sku: "UAT-SUNFLOWER-1L", variantName: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 4200, compareAtPriceMinor: 4800, stock: "28" },
  { id: "uat_prd_tpa", slug: "tomato-paste", name: "Tomato Paste", categorySlug: "oils-sauces", shortDescription: "Rich tomato paste for stews and jollof.", description: "Generic UAT tomato-paste fixture; no brand claim.", image: photo("1546094096-0df4bcaaa337"), tags: ["uat-preview", "tomato", "sauce"], variantId: "uat_var_tpa", sku: "UAT-TOMPASTE-400", variantName: "400 g tin", unit: "piece", unitSize: "400 g", priceMinor: 800, stock: "70" },

  { id: "uat_prd_fml", slug: "fresh-pasteurised-milk", name: "Fresh Pasteurised Milk", categorySlug: "dairy-eggs", shortDescription: "Chilled fresh milk for breakfast and baking.", description: "Generic UAT fresh-milk fixture; keep chilled in real operations.", image: photo("1563636619-e9143da7973b"), tags: ["uat-preview", "milk", "dairy"], variantId: "uat_var_fml", sku: "UAT-MILK-1L", variantName: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 1800, stock: "22" },
  { id: "uat_prd_egg", slug: "farm-eggs", name: "Farm Eggs", categorySlug: "dairy-eggs", shortDescription: "Fresh eggs in a convenient family tray.", description: "Generic UAT farm-egg fixture.", image: photo("1582722872445-44dc5f7e3c8f"), tags: ["uat-preview", "eggs", "protein"], variantId: "uat_var_egg", sku: "UAT-EGGS-30", variantName: "Pack of 30", unit: "pack", unitSize: "30 eggs", priceMinor: 4200, stock: "26" },
  { id: "uat_prd_yog", slug: "natural-yoghurt", name: "Natural Yoghurt", categorySlug: "dairy-eggs", shortDescription: "Plain natural yoghurt for breakfast and snacks.", description: "Generic UAT yoghurt fixture.", image: photo("1550583724-b2692b85b150"), tags: ["uat-preview", "yoghurt", "dairy"], variantId: "uat_var_yog", sku: "UAT-YOGHURT-500", variantName: "500 g tub", unit: "piece", unitSize: "500 g", priceMinor: 2000, stock: "25" },

  { id: "uat_prd_wat", slug: "bottled-water", name: "Bottled Water", categorySlug: "beverages", shortDescription: "Still bottled drinking water.", description: "Generic UAT bottled-water fixture; no brand claim.", image: photo("1523362628745-0c100150b504"), tags: ["uat-preview", "water", "drink"], variantId: "uat_var_wat", sku: "UAT-WATER-750", variantName: "750 ml bottle", unit: "piece", unitSize: "750 ml", priceMinor: 300, stock: "90" },
  { id: "uat_prd_man", slug: "mango-juice", name: "Mango Juice", categorySlug: "beverages", shortDescription: "Refreshing mango juice for family meals.", description: "Generic UAT mango-juice fixture; no brand claim.", image: photo("1600271886742-f049cd451bba"), tags: ["uat-preview", "juice", "mango"], variantId: "uat_var_man", sku: "UAT-MANGOJUICE-1L", variantName: "1 litre", unit: "litre", unitSize: "1 L", priceMinor: 2500, stock: "35" },
  { id: "uat_prd_tea", slug: "black-tea-bags", name: "Black Tea Bags", categorySlug: "beverages", shortDescription: "Classic black tea bags for a warm cup any time.", description: "Generic UAT tea fixture; no brand claim.", image: photo("1544145945-f90425340c7e"), tags: ["uat-preview", "tea", "drink"], variantId: "uat_var_tea", sku: "UAT-TEA-25", variantName: "Pack of 25 bags", unit: "pack", unitSize: "25 bags", priceMinor: 1200, stock: "44" },

  { id: "uat_prd_plc", slug: "plantain-chips", name: "Plantain Chips", categorySlug: "snacks", shortDescription: "Crispy salted plantain chips.", description: "Generic UAT plantain-chip fixture.", image: photo("1599490659213-e2b9527bd087"), tags: ["uat-preview", "snack", "plantain"], variantId: "uat_var_plc", sku: "UAT-CHIPS-100", variantName: "100 g pack", unit: "pack", unitSize: "100 g", priceMinor: 500, compareAtPriceMinor: 650, stock: "75" },
  { id: "uat_prd_grn", slug: "roasted-groundnuts", name: "Roasted Groundnuts", categorySlug: "snacks", shortDescription: "Crunchy roasted groundnuts for snacking.", description: "Generic UAT roasted-groundnut fixture.", image: photo("1599490659213-e2b9527bd087"), tags: ["uat-preview", "snack", "groundnut"], variantId: "uat_var_grn", sku: "UAT-GROUNDNUT-400", variantName: "400 g pack", unit: "pack", unitSize: "400 g", priceMinor: 1500, stock: "42" },
  { id: "uat_prd_dig", slug: "digestive-biscuits", name: "Digestive Biscuits", categorySlug: "snacks", shortDescription: "Wholewheat-style biscuits for tea time.", description: "Generic UAT biscuit fixture; no brand claim.", image: photo("1599490659213-e2b9527bd087"), tags: ["uat-preview", "snack", "biscuit"], variantId: "uat_var_dig", sku: "UAT-BISCUIT-250", variantName: "250 g pack", unit: "pack", unitSize: "250 g", priceMinor: 800, stock: "55" },

  { id: "uat_prd_dsh", slug: "multi-purpose-dish-liquid", name: "Dishwashing Liquid", categorySlug: "household", shortDescription: "Lemon-style dishwashing liquid for everyday cleaning.", description: "Generic UAT household-cleaning fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "household", "cleaning"], variantId: "uat_var_dsh", sku: "UAT-DISH-500", variantName: "500 ml bottle", unit: "piece", unitSize: "500 ml", priceMinor: 1800, stock: "30" },
  { id: "uat_prd_lsy", slug: "laundry-soap-bar", name: "Laundry Soap Bar", categorySlug: "household", shortDescription: "Laundry soap bar for hand washing.", description: "Generic UAT laundry-soap fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "household", "laundry"], variantId: "uat_var_lsy", sku: "UAT-LAUNDRY-BAR", variantName: "Single bar", unit: "piece", unitSize: "1 bar", priceMinor: 600, stock: "65" },
  { id: "uat_prd_tis", slug: "toilet-tissue", name: "Toilet Tissue", categorySlug: "household", shortDescription: "Soft two-ply toilet tissue rolls.", description: "Generic UAT tissue fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "household", "tissue"], variantId: "uat_var_tis", sku: "UAT-TISSUE-10", variantName: "Pack of 10 rolls", unit: "pack", unitSize: "10 rolls", priceMinor: 4200, stock: "28" },

  { id: "uat_prd_ans", slug: "antiseptic-soap", name: "Antiseptic Soap", categorySlug: "personal-care", shortDescription: "Everyday antiseptic bath soap.", description: "Generic UAT personal-care soap fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "personal-care", "soap"], variantId: "uat_var_ans", sku: "UAT-SOAP-125", variantName: "125 g bar", unit: "piece", unitSize: "125 g", priceMinor: 700, stock: "52" },
  { id: "uat_prd_tth", slug: "toothpaste", name: "Fluoride Toothpaste", categorySlug: "personal-care", shortDescription: "Everyday fluoride toothpaste for oral care.", description: "Generic UAT toothpaste fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "personal-care", "oral-care"], variantId: "uat_var_tth", sku: "UAT-TOOTHPASTE-130", variantName: "130 g tube", unit: "piece", unitSize: "130 g", priceMinor: 1400, stock: "40" },
  { id: "uat_prd_san", slug: "hand-sanitiser", name: "Hand Sanitiser", categorySlug: "personal-care", shortDescription: "Pocket-size hand sanitiser gel.", description: "Generic UAT hand-sanitiser fixture; no brand claim.", image: photo("1583947215259-38e31be8751f"), tags: ["uat-preview", "personal-care", "hygiene"], variantId: "uat_var_san", sku: "UAT-SANITISER-100", variantName: "100 ml bottle", unit: "piece", unitSize: "100 ml", priceMinor: 1200, stock: "34" },

  { id: "uat_prd_til", slug: "frozen-tilapia", name: "Frozen Tilapia", categorySlug: "meat-fish", shortDescription: "Frozen whole tilapia for family meals.", description: "Generic UAT frozen-tilapia fixture.", image: photo("1607623814075-e51df1bdc82f"), tags: ["uat-preview", "fish", "frozen"], variantId: "uat_var_til", sku: "UAT-TILAPIA-PC", variantName: "Per fish", unit: "piece", unitSize: "1 fish", priceMinor: 1800, stock: "24" },
  { id: "uat_prd_chk", slug: "frozen-whole-chicken", name: "Frozen Whole Chicken", categorySlug: "meat-fish", shortDescription: "Frozen whole chicken for roasting and stews.", description: "Generic UAT frozen-chicken fixture.", image: photo("1607623814075-e51df1bdc82f"), tags: ["uat-preview", "chicken", "frozen"], variantId: "uat_var_chk", sku: "UAT-CHICKEN-PC", variantName: "Per chicken", unit: "piece", unitSize: "~1.1 kg", priceMinor: 5500, stock: "18" },
  { id: "uat_prd_cor", slug: "corned-beef", name: "Corned Beef", categorySlug: "meat-fish", shortDescription: "Tinned corned beef for quick meals.", description: "Generic UAT tinned-protein fixture; no brand claim.", image: photo("1607623814075-e51df1bdc82f"), tags: ["uat-preview", "beef", "protein"], variantId: "uat_var_cor", sku: "UAT-CORNEDBEEF-340", variantName: "340 g tin", unit: "piece", unitSize: "340 g", priceMinor: 2200, stock: "36" },

  { id: "uat_prd_wip", slug: "baby-wipes", name: "Baby Wipes", categorySlug: "baby-family", shortDescription: "Soft fragrance-free baby wipes.", description: "Generic UAT baby-wipe fixture; no brand claim.", image: photo("1522771930-78848d9293e8"), tags: ["uat-preview", "baby", "care"], variantId: "uat_var_wip", sku: "UAT-BABYWIPES-80", variantName: "Pack of 80 wipes", unit: "pack", unitSize: "80 wipes", priceMinor: 2500, stock: "24" },
  { id: "uat_prd_dia", slug: "baby-diapers-size-m", name: "Baby Diapers (Size M)", categorySlug: "baby-family", shortDescription: "Disposable medium-size diapers for family care.", description: "Generic UAT diaper fixture; no brand claim.", image: photo("1522771930-78848d9293e8"), tags: ["uat-preview", "baby", "family"], variantId: "uat_var_dia", sku: "UAT-DIAPERS-M36", variantName: "Size M, pack of 36", unit: "pack", unitSize: "36 diapers", priceMinor: 9500, stock: "16" },
  { id: "uat_prd_cer", slug: "baby-maize-cereal", name: "Baby Maize Cereal", categorySlug: "baby-family", shortDescription: "Fortified-style maize cereal preview item.", description: "Generic UAT baby-cereal fixture; no nutrition or brand claim.", image: photo("1522771930-78848d9293e8"), tags: ["uat-preview", "baby", "cereal"], variantId: "uat_var_cer", sku: "UAT-BABYCEREAL-400", variantName: "400 g pack", unit: "pack", unitSize: "400 g", priceMinor: 4500, stock: "20" },
];

function requireUatAuthority() {
  if (process.env.VARIETY_UAT_SEED_CONFIRM !== CONFIRM_TOKEN) {
    throw new Error("VARIETY_UAT_SEED_CONFIRM is missing or invalid");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  let databaseName = "";
  try {
    databaseName = new URL(databaseUrl).pathname.replace(/^\//, "").split("/")[0] ?? "";
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }
  if (databaseName !== REQUIRED_DATABASE) {
    throw new Error(`Rich UAT seed is restricted to ${REQUIRED_DATABASE}`);
  }
}

async function main() {
  requireUatAuthority();
  const config = readConfig();
  const db = new Database(config);
  try {
    const summary = await db.$transaction(async (tx) => {
      await tx.location.upsert({
        where: { id: config.stockLocationId },
        create: { id: config.stockLocationId, name: "Variety Groceries UAT stock" },
        update: { active: true },
      });

      // The private integration preview fixture predates the rich UAT catalogue.
      // Keep it in the database for integration work, but never expose it to shoppers.
      await tx.product.updateMany({
        where: { id: "preview_rice" },
        data: { published: false },
      });
      await tx.category.updateMany({
        where: { id: "preview_food" },
        data: { active: false },
      });

      const categoryIds = new Map<string, string>();
      for (const category of categories) {
        const row = await tx.category.upsert({
          where: { slug: category.slug },
          create: category,
          update: {
            name: category.name,
            description: category.description,
            tint: category.tint,
            sortOrder: category.sortOrder,
            active: true,
          },
        });
        categoryIds.set(category.slug, row.id);
      }

      let stockCreated = 0;
      for (const item of products) {
        const categoryId = categoryIds.get(item.categorySlug);
        if (!categoryId) throw new Error(`Missing seeded category: ${item.categorySlug}`);
        const product = await tx.product.upsert({
          where: { slug: item.slug },
          create: {
            id: item.id,
            slug: item.slug,
            name: item.name,
            categoryId,
            description: item.description,
            shortDescription: item.shortDescription,
            image: item.image,
            tags: item.tags,
            published: true,
            brandMode: "unbranded",
          },
          update: {
            name: item.name,
            categoryId,
            description: item.description,
            shortDescription: item.shortDescription,
            image: item.image,
            tags: item.tags,
            published: true,
            brandMode: "unbranded",
          },
        });

        const variant = await tx.variant.upsert({
          where: { sku: item.sku },
          create: {
            id: item.variantId,
            productId: product.id,
            sku: item.sku,
            name: item.variantName,
            unit: item.unit,
            unitSize: item.unitSize,
            priceMinor: item.priceMinor,
            compareAtPriceMinor: item.compareAtPriceMinor,
            active: true,
          },
          update: {
            productId: product.id,
            name: item.variantName,
            unit: item.unit,
            unitSize: item.unitSize,
            priceMinor: item.priceMinor,
            compareAtPriceMinor: item.compareAtPriceMinor ?? null,
            active: true,
          },
        });

        const position = await tx.stockPosition.upsert({
          where: { variantId_locationId: { variantId: variant.id, locationId: config.stockLocationId } },
          create: { variantId: variant.id, locationId: config.stockLocationId },
          update: {},
        });

        const lotId = `uat_lot_${item.variantId}`;
        if (!(await tx.stockLot.findUnique({ where: { id: lotId } }))) {
          const receipt = await tx.stockReceipt.create({
            data: { receivedBy: "uat-catalog-seed", note: `Rich UAT preview stock for ${item.name}` },
          });
          await tx.stockLot.create({
            data: {
              id: lotId,
              positionId: position.id,
              receiptId: receipt.id,
              lotNumber: `UAT-${item.sku}-INITIAL`,
              quantity: item.stock,
            },
          });
          await tx.stockMovement.create({
            data: {
              lotId,
              receiptId: receipt.id,
              delta: item.stock,
              resultingQty: item.stock,
              actorId: "uat-catalog-seed",
              reason: "receive",
            },
          });
          stockCreated += 1;
        }
      }

      await tx.auditEvent.create({
        data: {
          actorId: "uat-catalog-seed",
          action: "catalog.uat_preview_seeded",
          entityId: "rich-uat-catalog-v1",
          requestId: randomUUID(),
          details: { categories: categories.length, products: products.length, stockCreated },
        },
      });

      return { categories: categories.length, products: products.length, stockCreated };
    });

    console.log(JSON.stringify({ event: "catalog.uat_preview_seed.completed", ...summary }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Rich UAT catalogue seed failed");
  process.exitCode = 1;
});
