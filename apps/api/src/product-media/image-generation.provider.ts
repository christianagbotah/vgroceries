export type GeneratedImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface GeneratedImageCandidate {
  bytes: Buffer;
  mimeType: GeneratedImageMimeType;
  providerRequestId?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  model: string;
  candidateCount: number;
}

export interface ImageEditRequest extends ImageGenerationRequest {
  referenceImage: Buffer;
  referenceMimeType: GeneratedImageMimeType;
}

export interface ImageGenerationProvider {
  readonly id: string;
  generate(request: ImageGenerationRequest): Promise<GeneratedImageCandidate[]>;
  edit(request: ImageEditRequest): Promise<GeneratedImageCandidate[]>;
}
