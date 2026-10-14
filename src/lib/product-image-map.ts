const photo = (id: string, width = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=84`;

const PRODUCT_IMAGES: Record<string, string> = {
  "fresh-tomatoes": photo("1546094096-0df4bcaaa337"),
  "tomato-paste": photo("1546094096-0df4bcaaa337"),
  "red-onions": photo("1540420773420-3366772f4999"),
  "ripe-plantain": photo("1603833665858-e61d17a86224"),
  "pona-yam": photo("1518977676601-b53f82aba655"),
  "cocoyam": photo("1518977676601-b53f82aba655"),
  "sweet-bananas": photo("1603833665858-e61d17a86224"),
  oranges: photo("1610832958506-aa56368176cf"),
  "fresh-pasteurised-milk": photo("1563636619-e9143da7973b"),
  "farm-eggs": photo("1582722872445-44dc5f7e3c8f"),
  "mango-juice": photo("1600271886742-f049cd451bba"),
  "bottled-water": photo("1523362628745-0c100150b504"),
  "sachet-water": photo("1523362628745-0c100150b504"),
  "milo-cocoa-drink": photo("1512568400610-62da28bc8a13"),
  "red-palm-oil": photo("1474979266404-7eaacbcd87c5"),
  "sunflower-cooking-oil": photo("1474979266404-7eaacbcd87c5"),
  "sardines-tomato-sauce": photo("1607623814075-e51df1bdc82f"),
  "rolled-oats": photo("1536304993881-ff6e9eefa2a6"),
  "imported-long-grain-rice": photo("1536304993881-ff6e9eefa2a6"),
  "perfumed-local-rice": photo("1536304993881-ff6e9eefa2a6"),
  "black-eyed-beans": photo("1515543904379-3d757afe72e4"),
  "wheat-flour": photo("1509440159596-0249088772ff"),
  "plantain-chips": photo("1599490659213-e2b9527bd087"),
  "roasted-groundnuts": photo("1599490659213-e2b9527bd087"),
  "digestive-biscuits": photo("1599490659213-e2b9527bd087"),
  "toffee-assortment": photo("1599490659213-e2b9527bd087"),
  "frozen-tilapia": photo("1607623814075-e51df1bdc82f"),
  "frozen-whole-chicken": photo("1607623814075-e51df1bdc82f"),
  "corned-beef": photo("1607623814075-e51df1bdc82f"),
  sardines: photo("1607623814075-e51df1bdc82f"),
};

const RULES: Array<[RegExp, string]> = [
  [/tomato|pepper|onion|okro|garden-egg|yam|cocoyam|plantain/, photo("1540420773420-3366772f4999")],
  [/banana|orange|fruit/, photo("1610832958506-aa56368176cf")],
  [/milk|yoghurt|egg|baby-maize-cereal/, photo("1550583724-b2692b85b150")],
  [/rice|gari|maize|flour|oat|bean/, photo("1536304993881-ff6e9eefa2a6")],
  [/oil|sauce|paste|shito/, photo("1542838132-92c53300491e")],
  [/juice|water|cola|tea|cocoa|milo/, photo("1544145945-f90425340c7e")],
  [/biscuit|chip|groundnut|toffee|snack/, photo("1599490659213-e2b9527bd087")],
  [/tilapia|chicken|beef|sardine|fish|meat/, photo("1607623814075-e51df1bdc82f")],
  [/soap|cleaner|sanitiser|sanitizer|laundry|dish|tissue|toothpaste|coil|matches/, photo("1583947215259-38e31be8751f")],
  [/baby|diaper|wipe/, photo("1522771930-78848d9293e8")],
];

const FALLBACK_PRODUCT_IMAGE = photo("1542838132-92c53300491e");

export function productImageFor(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  const exact = PRODUCT_IMAGES[normalized];
  if (exact) return exact;
  return RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? FALLBACK_PRODUCT_IMAGE;
}

const CATEGORY_IMAGES: Record<string, string> = {
  "fresh-produce": photo("1540420773420-3366772f4999", 720),
  "grains-staples": photo("1536304993881-ff6e9eefa2a6", 720),
  "oils-sauces": photo("1474979266404-7eaacbcd87c5", 720),
  "dairy-eggs": photo("1550583724-b2692b85b150", 720),
  beverages: photo("1600271886742-f049cd451bba", 720),
  snacks: photo("1599490659213-e2b9527bd087", 720),
  household: photo("1583947215259-38e31be8751f", 720),
  "personal-care": photo("1583947215259-38e31be8751f", 720),
  "meat-fish": photo("1607623814075-e51df1bdc82f", 720),
  "baby-family": photo("1522771930-78848d9293e8", 720),
};

export function categoryImageFor(slug: string): string {
  return CATEGORY_IMAGES[slug.trim().toLowerCase()] ?? FALLBACK_PRODUCT_IMAGE;
}

export const storefrontHeroImage = photo("1542838132-92c53300491e", 1800);
export const storefrontProducePromoImage = photo("1488459716781-31db52582fe9", 1200);
export const storefrontPantryPromoImage = photo("1543168256-418811576931", 1000);
