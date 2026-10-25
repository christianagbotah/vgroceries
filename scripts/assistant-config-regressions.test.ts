import { describe, expect, test } from "bun:test";
import { readConfig } from "../apps/api/src/config";

const base = {
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  API_STOCK_LOCATION_ID: "loc_accra",
  WEB_ORIGINS: "http://localhost:3000",
};

describe("Ghana shopping assistant configuration", () => {
  test("keeps the deterministic assistant enabled without model credentials", () => {
    expect(readConfig(base).assistantAi).toBeNull();
  });

  test("requires an explicit model name when OpenAI interpretation is enabled", () => {
    expect(() => readConfig({
      ...base,
      AI_ASSISTANT_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
    })).toThrow("AI_ASSISTANT_MODEL is required");
  });

  test("accepts a complete server-only assistant configuration", () => {
    expect(readConfig({
      ...base,
      AI_ASSISTANT_PROVIDER: "openai",
      AI_ASSISTANT_MODEL: "merchant-selected-model",
      AI_ASSISTANT_TIMEOUT_MS: "15000",
      OPENAI_API_KEY: "test-key",
    }).assistantAi).toEqual({
      providerId: "openai",
      model: "merchant-selected-model",
      openAiApiKey: "test-key",
      timeoutMs: 15000,
    });
  });
});
