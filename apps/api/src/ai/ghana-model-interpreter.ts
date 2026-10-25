import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { GhanaMealPlanRequest } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { GHANA_FOOD_CONCEPTS } from "./ghana-food-lexicon";
import { GHANA_MEAL_TEMPLATES } from "./ghana-meal-templates";

const modelIntentSchema = z.object({
  detectedLanguage: z.enum(["english", "twi", "ga", "ewe", "mixed", "unknown"]),
  dishId: z.enum(["yam_ampesi_kontomire", "fufu_light_soup", "fufu_groundnut_soup"]).nullable(),
  conceptIds: z.array(z.enum([
    "yam", "kontomire", "salted_fish", "egg", "onion", "cassava", "plantain",
    "goat_meat", "beef", "tomato", "pepper", "groundnut_paste", "palm_oil", "ginger", "garlic",
  ])).max(30),
  servings: z.number().int().min(1).max(20).nullable(),
});
export type GhanaModelIntent = z.infer<typeof modelIntentSchema>;

@Injectable()
export class GhanaModelInterpreter {
  private readonly logger = new Logger(GhanaModelInterpreter.name);
  private client?: OpenAI;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  private openAi() {
    if (!this.config.assistantAi) return null;
    this.client ??= new OpenAI({
      apiKey: this.config.assistantAi.openAiApiKey,
      timeout: this.config.assistantAi.timeoutMs,
      maxRetries: 1,
    });
    return this.client;
  }

  async interpret(input: GhanaMealPlanRequest): Promise<GhanaModelIntent | null> {
    const client = this.openAi();
    const assistant = this.config.assistantAi;
    if (!client || !assistant) return null;

    const concepts = GHANA_FOOD_CONCEPTS.map((concept) => `${concept.id}: ${concept.label}; aliases=${concept.aliases.map((alias) => alias.term).join(", ")}`).join("\n");
    const dishes = GHANA_MEAL_TEMPLATES.map((dish) => `${dish.id}: ${dish.label}; aliases=${dish.aliases.join(", ")}`).join("\n");
    const instructions = [
      "You interpret grocery meal requests from Ghanaian customers who may speak or code-switch between Twi, Ga, Ewe and English.",
      "Map meaning only to the provided dish IDs and ingredient concept IDs. Never create product IDs, brands, stock claims, prices, quantities for sale, payment claims or delivery promises.",
      "Use null dishId when the request does not clearly match one of the listed dishes. Include only ingredient concepts explicitly requested or strongly implied by a matched listed dish; the server will apply the audited recipe template.",
      "Infer servings when the customer states household size. Otherwise return null and let the application use its chosen serving count.",
      "Known ingredient concepts:", concepts,
      "Known dish templates:", dishes,
    ].join("\n");

    try {
      const response = await client.responses.parse({
        model: assistant.model,
        input: [
          { role: "system", content: instructions },
          { role: "user", content: input.text },
        ],
        text: { format: zodTextFormat(modelIntentSchema, "ghana_grocery_meal_intent") },
      });
      return response.output_parsed ?? null;
    } catch (error) {
      this.logger.warn(`Multilingual model interpretation failed; using audited local fallback. ${error instanceof Error ? error.message : "Unknown model error"}`);
      return null;
    }
  }
}
