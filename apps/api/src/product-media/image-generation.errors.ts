export type ImageGenerationProviderErrorCode =
  | "unavailable"
  | "rate_limited"
  | "invalid_request"
  | "safety_rejected"
  | "transient_failure";

export class ImageGenerationProviderError extends Error {
  constructor(
    readonly code: ImageGenerationProviderErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImageGenerationProviderError";
  }

  get retryable(): boolean {
    return ["unavailable", "rate_limited", "transient_failure"].includes(this.code);
  }
}

export function normalizeImageGenerationError(error: unknown): ImageGenerationProviderError {
  if (error instanceof ImageGenerationProviderError) return error;
  const value = error as { status?: number; code?: string; type?: string; name?: string; message?: string };
  const status = Number(value?.status ?? 0);
  const code = String(value?.code ?? value?.type ?? "").toLowerCase();
  const message = String(value?.message ?? "Image generation provider request failed.");
  if (status === 429 || code.includes("rate_limit"))
    return new ImageGenerationProviderError("rate_limited", "Image generation is temporarily rate limited.", error);
  if (code.includes("content_policy") || code.includes("safety") || code.includes("moderation"))
    return new ImageGenerationProviderError("safety_rejected", "The image request was rejected by provider safety controls.", error);
  if (status === 400 || code.includes("invalid_request"))
    return new ImageGenerationProviderError("invalid_request", "The image provider rejected the request as invalid.", error);
  if (status === 502 || status === 503 || status === 504 || code.includes("unavailable"))
    return new ImageGenerationProviderError("unavailable", "The image generation provider is temporarily unavailable.", error);
  return new ImageGenerationProviderError("transient_failure", message || "Image generation failed temporarily.", error);
}
