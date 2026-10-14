import type { ImageGenerationConfig } from "../config";
import type { ImageGenerationProvider } from "./image-generation.provider";
import { FakeImageGenerationProvider } from "./fake-image-generation.provider";
import {
  OpenAIImageGenerationProvider,
  type OpenAIImageClient,
} from "./openai-image-generation.provider";

export function createImageGenerationProvider(
  config: ImageGenerationConfig | null,
  openAiClient?: OpenAIImageClient,
): ImageGenerationProvider | null {
  if (!config) return null;
  if (config.providerId === "fake") return new FakeImageGenerationProvider();
  if (config.providerId === "openai") {
    if (!config.openAiApiKey)
      throw new Error("OpenAI image generation configuration requires a server API key.");
    return new OpenAIImageGenerationProvider(
      {
        apiKey: config.openAiApiKey,
        model: config.model,
        timeoutMs: config.timeoutMs,
      },
      openAiClient,
    );
  }
  const exhaustive: never = config.providerId;
  throw new Error(`Unsupported image generation provider: ${String(exhaustive)}`);
}
