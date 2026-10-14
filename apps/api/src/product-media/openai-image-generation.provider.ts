import OpenAI, { toFile } from "openai";
import type {
  GeneratedImageCandidate,
  GeneratedImageMimeType,
  ImageEditRequest,
  ImageGenerationProvider,
  ImageGenerationRequest,
} from "./image-generation.provider";
import {
  ImageGenerationProviderError,
  normalizeImageGenerationError,
} from "./image-generation.errors";

export interface OpenAIImageGenerationProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export type OpenAIImageClient = Pick<OpenAI, "images">;

function mimeFor(outputFormat?: string): GeneratedImageMimeType {
  if (outputFormat === "jpeg") return "image/jpeg";
  if (outputFormat === "webp") return "image/webp";
  return "image/png";
}

function decodeResponse(response: unknown): GeneratedImageCandidate[] {
  const result = response as {
    data?: Array<{ b64_json?: string }>;
    output_format?: string;
    _request_id?: string;
    id?: string;
  };
  const rows = result.data ?? [];
  if (!rows.length || rows.some((row) => !row.b64_json))
    throw new ImageGenerationProviderError(
      "transient_failure",
      "The image provider returned no usable image bytes.",
    );
  const requestId = result._request_id ?? result.id;
  return rows.map((row) => ({
    bytes: Buffer.from(row.b64_json!, "base64"),
    mimeType: mimeFor(result.output_format),
    ...(requestId ? { providerRequestId: requestId } : {}),
  }));
}

function referenceFilename(mimeType: GeneratedImageMimeType) {
  if (mimeType === "image/jpeg") return "reference.jpg";
  if (mimeType === "image/webp") return "reference.webp";
  return "reference.png";
}

export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "openai";
  private readonly client: OpenAIImageClient;

  constructor(
    private readonly config: OpenAIImageGenerationProviderConfig,
    client?: OpenAIImageClient,
  ) {
    this.client = client ?? new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImageCandidate[]> {
    try {
      const response = await this.client.images.generate({
        model: request.model || this.config.model,
        prompt: request.prompt,
        n: request.candidateCount,
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
      });
      return decodeResponse(response);
    } catch (error) {
      throw normalizeImageGenerationError(error);
    }
  }

  async edit(request: ImageEditRequest): Promise<GeneratedImageCandidate[]> {
    try {
      const image = await toFile(
        new Uint8Array(request.referenceImage),
        referenceFilename(request.referenceMimeType),
        { type: request.referenceMimeType },
      );
      const response = await this.client.images.edit({
        model: request.model || this.config.model,
        prompt: request.prompt,
        image,
        n: request.candidateCount,
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
        input_fidelity: "high",
      });
      return decodeResponse(response);
    } catch (error) {
      throw normalizeImageGenerationError(error);
    }
  }
}
