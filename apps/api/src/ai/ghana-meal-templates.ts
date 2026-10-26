export interface GhanaMealIngredientTemplate {
  conceptId: string;
  /** Approximate sellable-unit quantity for four servings; final cart quantity is editable. */
  baseQuantity: number;
  optional?: boolean;
}

export interface GhanaMealTemplate {
  id: string;
  label: string;
  aliases: string[];
  baseServings: number;
  ingredients: GhanaMealIngredientTemplate[];
}

export const GHANA_MEAL_TEMPLATES: GhanaMealTemplate[] = [
  {
    id: "yam_ampesi_kontomire",
    label: "Yam ampesi with kontomire / ebunebunu",
    aliases: ["yam ampesi", "ampesi", "ampesi with kontomire", "ampesi with ebunebunu", "ebunebunu", "kontomire ampesi"],
    baseServings: 4,
    ingredients: [
      { conceptId: "yam", baseQuantity: 2 },
      { conceptId: "kontomire", baseQuantity: 1 },
      { conceptId: "onion", baseQuantity: 2 },
      { conceptId: "tomato", baseQuantity: 3 },
      { conceptId: "pepper", baseQuantity: 2 },
      { conceptId: "palm_oil", baseQuantity: 1 },
      { conceptId: "salted_fish", baseQuantity: 1, optional: true },
      { conceptId: "egg", baseQuantity: 4, optional: true },
    ],
  },
  {
    id: "fufu_light_soup",
    label: "Fufu with light soup",
    aliases: ["fufu with light soup", "fufu light soup", "light soup and fufu", "light soup with fufu"],
    baseServings: 4,
    ingredients: [
      { conceptId: "cassava", baseQuantity: 2.5 },
      { conceptId: "plantain", baseQuantity: 1.5 },
      { conceptId: "goat_meat", baseQuantity: 1.5 },
      { conceptId: "tomato", baseQuantity: 4 },
      { conceptId: "pepper", baseQuantity: 3 },
      { conceptId: "onion", baseQuantity: 2 },
      { conceptId: "ginger", baseQuantity: 1, optional: true },
      { conceptId: "garlic", baseQuantity: 1, optional: true },
    ],
  },
  {
    id: "fufu_groundnut_soup",
    label: "Fufu with groundnut soup",
    aliases: ["fufu with groundnut soup", "fufu groundnut soup", "groundnut soup and fufu", "groundnut soup with fufu"],
    baseServings: 4,
    ingredients: [
      { conceptId: "cassava", baseQuantity: 2.5 },
      { conceptId: "plantain", baseQuantity: 1.5 },
      { conceptId: "groundnut_paste", baseQuantity: 1 },
      { conceptId: "goat_meat", baseQuantity: 1.5 },
      { conceptId: "tomato", baseQuantity: 3 },
      { conceptId: "pepper", baseQuantity: 3 },
      { conceptId: "onion", baseQuantity: 2 },
    ],
  },
  {
    id: "ghana_jollof",
    label: "Ghana jollof rice",
    aliases: ["ghana jollof", "jollof rice", "jollof"],
    baseServings: 4,
    ingredients: [
      { conceptId: "rice", baseQuantity: 1 },
      { conceptId: "tomato", baseQuantity: 1 },
      { conceptId: "tomato_paste", baseQuantity: 1 },
      { conceptId: "onion", baseQuantity: 1 },
      { conceptId: "pepper", baseQuantity: 1 },
      { conceptId: "vegetable_oil", baseQuantity: 1 },
    ],
  },
  {
    id: "waakye",
    label: "Waakye",
    aliases: ["waakye", "waache"],
    baseServings: 4,
    ingredients: [
      { conceptId: "rice", baseQuantity: 1 },
      { conceptId: "beans", baseQuantity: 1 },
    ],
  },
  {
    id: "red_red",
    label: "Red-red with plantain and beans",
    aliases: ["red-red", "red red", "beans with plantain", "plantain with beans"],
    baseServings: 4,
    ingredients: [
      { conceptId: "beans", baseQuantity: 1 },
      { conceptId: "plantain", baseQuantity: 1 },
      { conceptId: "palm_oil", baseQuantity: 1 },
      { conceptId: "onion", baseQuantity: 1 },
      { conceptId: "tomato", baseQuantity: 1 },
      { conceptId: "pepper", baseQuantity: 1 },
    ],
  },
];

export function mealTemplateById(id: string) {
  return GHANA_MEAL_TEMPLATES.find((template) => template.id === id);
}

export function matchMealTemplate(text: string) {
  const normalized = text.trim().toLocaleLowerCase();
  return GHANA_MEAL_TEMPLATES
    .flatMap((template) => template.aliases.map((alias) => ({ template, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => normalized.includes(alias.toLocaleLowerCase()))?.template;
}
