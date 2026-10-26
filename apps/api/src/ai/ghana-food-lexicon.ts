export type GhanaFoodLanguage = "english" | "twi" | "ga" | "ewe" | "ghana";

export interface GhanaFoodAlias {
  term: string;
  language: GhanaFoodLanguage;
}

export interface GhanaFoodConcept {
  id: string;
  label: string;
  searchTerms: string[];
  aliases: GhanaFoodAlias[];
  /** Product-name/tag terms that make a discovered catalogue item the wrong culinary form. */
  excludedProductTerms?: string[];
  /** At least one of these product-name/tag terms must be present for form-specific concepts. */
  requiredProductTerms?: string[];
  /** Ingredient words that may appear after an explicit count in variant.unitSize, e.g. `30 eggs`. */
  countUnitTerms?: string[];
}

export const GHANA_FOOD_LEXICON_VERSION = "2026-10-26.1";

/**
 * Reviewable Ghana food vocabulary. Local names supplied by the product owner
 * are kept as data rather than hidden in prompt text so corrections can be
 * audited without changing commerce logic.
 */
export const GHANA_FOOD_CONCEPTS: GhanaFoodConcept[] = [
  { id: "yam", label: "Yam", searchTerms: ["yam"], aliases: [{ term: "yam", language: "english" }] },
  { id: "kontomire", label: "Kontomire / cocoyam leaves", searchTerms: ["kontomire", "cocoyam leaves", "cocoyam leaf"], aliases: [{ term: "kontomire", language: "twi" }, { term: "ebunebunu", language: "ghana" }] },
  { id: "salted_fish", label: "Salted fish", searchTerms: ["salted fish", "kobi", "koobi", "momoni", "fish"], aliases: [{ term: "momoni", language: "ghana" }, { term: "kobi", language: "ghana" }, { term: "koobi", language: "ghana" }], requiredProductTerms: ["salted", "kobi", "koobi", "momoni"] },
  { id: "egg", label: "Egg", searchTerms: ["egg", "eggs"], aliases: [{ term: "nkosua", language: "twi" }, { term: "kokloji", language: "ewe" }, { term: "egg", language: "english" }], countUnitTerms: ["egg", "eggs"] },
  { id: "onion", label: "Onion", searchTerms: ["onion", "onions"], aliases: [{ term: "jene", language: "ga" }, { term: "sabala", language: "ewe" }, { term: "onion", language: "english" }] },
  { id: "cassava", label: "Cassava", searchTerms: ["cassava"], aliases: [{ term: "cassava", language: "english" }] },
  { id: "plantain", label: "Plantain", searchTerms: ["plantain"], aliases: [{ term: "plantain", language: "english" }], excludedProductTerms: ["chips", "flour", "powder"] },
  { id: "goat_meat", label: "Goat meat", searchTerms: ["goat meat", "goat"], aliases: [{ term: "aponchi nam", language: "twi" }, { term: "aponchi", language: "twi" }, { term: "goat meat", language: "english" }] },
  { id: "beef", label: "Beef / cow meat", searchTerms: ["beef", "cow meat"], aliases: [{ term: "cow meat", language: "english" }, { term: "beef", language: "english" }] },
  { id: "tomato", label: "Tomato", searchTerms: ["tomato", "tomatoes"], aliases: [{ term: "tomato", language: "english" }, { term: "tomatoes", language: "english" }], excludedProductTerms: ["paste", "sauce", "ketchup"] },
  { id: "pepper", label: "Pepper", searchTerms: ["pepper", "chilli", "chili"], aliases: [{ term: "pepper", language: "english" }] },
  { id: "groundnut_paste", label: "Groundnut paste", searchTerms: ["groundnut paste", "groundnut", "peanut butter"], aliases: [{ term: "groundnut paste", language: "english" }, { term: "groundnut", language: "english" }], requiredProductTerms: ["paste", "peanut butter"] },
  { id: "palm_oil", label: "Palm oil", searchTerms: ["palm oil", "red oil"], aliases: [{ term: "palm oil", language: "english" }] },
  { id: "ginger", label: "Ginger", searchTerms: ["ginger"], aliases: [{ term: "ginger", language: "english" }] },
  { id: "garlic", label: "Garlic", searchTerms: ["garlic"], aliases: [{ term: "garlic", language: "english" }] },
  { id: "rice", label: "Rice", searchTerms: ["rice"], aliases: [{ term: "rice", language: "english" }], excludedProductTerms: ["cereal"] },
  { id: "beans", label: "Beans", searchTerms: ["beans", "black-eyed beans", "black eyed beans"], aliases: [{ term: "beans", language: "english" }] },
  { id: "gari", label: "Gari", searchTerms: ["gari", "garri"], aliases: [{ term: "gari", language: "ghana" }, { term: "garri", language: "ghana" }] },
  { id: "tomato_paste", label: "Tomato paste", searchTerms: ["tomato paste"], aliases: [{ term: "tomato paste", language: "english" }], requiredProductTerms: ["paste"] },
  { id: "vegetable_oil", label: "Vegetable / cooking oil", searchTerms: ["cooking oil", "sunflower oil", "vegetable oil"], aliases: [{ term: "cooking oil", language: "english" }, { term: "vegetable oil", language: "english" }], requiredProductTerms: ["oil"], excludedProductTerms: ["palm"] },
  { id: "chicken", label: "Chicken", searchTerms: ["chicken"], aliases: [{ term: "chicken", language: "english" }] },
];

export function foodConceptById(id: string) {
  return GHANA_FOOD_CONCEPTS.find((concept) => concept.id === id);
}

export function matchFoodConcept(term: string) {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return GHANA_FOOD_CONCEPTS.find((concept) =>
    concept.searchTerms.some((candidate) => candidate.toLocaleLowerCase() === needle)
      || concept.aliases.some((alias) => alias.term.toLocaleLowerCase() === needle),
  );
}

function termSpans(haystack: string, term: string) {
  const needle = term.toLocaleLowerCase();
  const spans: Array<{ start: number; end: number }> = [];
  if (!needle) return spans;
  const isWordChar = (value: string | undefined) => Boolean(value && /[\p{L}\p{N}]/u.test(value));
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    const end = index + needle.length;
    const before = index > 0 ? haystack[index - 1] : undefined;
    const after = end < haystack.length ? haystack[end] : undefined;
    if (!isWordChar(before) && !isWordChar(after)) spans.push({ start: index, end });
    cursor = index + Math.max(needle.length, 1);
  }
  return spans;
}

export function conceptsMentionedIn(text: string) {
  const haystack = text.toLocaleLowerCase();
  const matches = GHANA_FOOD_CONCEPTS.flatMap((concept) => {
    const terms = [...new Set([...concept.aliases.map((alias) => alias.term), ...concept.searchTerms])]
      .sort((a, b) => b.length - a.length);
    return terms.flatMap((term) => termSpans(haystack, term).map((span) => ({
      concept, matchedAlias: term, ...span,
    })));
  });

  const surviving = matches.filter((match) => !matches.some((other) =>
    other.concept.id !== match.concept.id
    && other.start <= match.start
    && other.end >= match.end
    && (other.end - other.start) > (match.end - match.start),
  ));

  const bestByConcept = new Map<string, (typeof surviving)[number]>();
  for (const match of surviving) {
    const current = bestByConcept.get(match.concept.id);
    if (!current || match.matchedAlias.length > current.matchedAlias.length) bestByConcept.set(match.concept.id, match);
  }

  return GHANA_FOOD_CONCEPTS.flatMap((concept) => {
    const match = bestByConcept.get(concept.id);
    return match ? [{ concept, matchedAlias: match.matchedAlias }] : [];
  });
}
