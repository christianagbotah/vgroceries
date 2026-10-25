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

export const GHANA_FOOD_LEXICON_VERSION = "2026-10-25.1";

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

export function conceptsMentionedIn(text: string) {
  const haystack = ` ${text.toLocaleLowerCase()} `;
  return GHANA_FOOD_CONCEPTS.flatMap((concept) => {
    const matched = [...concept.aliases.map((alias) => alias.term), ...concept.searchTerms]
      .sort((a, b) => b.length - a.length)
      .find((term) => haystack.includes(` ${term.toLocaleLowerCase()} `) || haystack.includes(term.toLocaleLowerCase()));
    return matched ? [{ concept, matchedAlias: matched }] : [];
  });
}
