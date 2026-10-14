/** Product media + AI generation contracts shared by web, API and future clients. */

export type ProductBrandMode = "auto" | "unbranded" | "branded";
export type ProductMediaSource = "upload" | "ai_generated" | "ai_edited" | "legacy_import";
export type ProductMediaStatus = "draft" | "ready_for_review" | "approved" | "rejected" | "archived";
export type ImageGenerationMode = "unbranded_generation" | "branded_packshot_edit";
export type ImageStylePreset = "clean_studio" | "fresh_market" | "lifestyle_kitchen" | "ghana_market";
export type ImageBackgroundIntent = "auto" | "plain" | "grocery_shelf" | "kitchen_counter" | "market_display";
export type ImageGenerationJobStatus = "queued" | "generating" | "succeeded" | "failed" | "cancelled";

export interface CatalogMediaImage {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
}

export interface ProductMediaView {
  id: string;
  productId: string;
  source: ProductMediaSource;
  status: ProductMediaStatus;
  previewUrl: string;
  publicUrl?: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  altText: string;
  galleryOrder?: number;
  originalFilename?: string;
  generationJobId?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationJobView {
  id: string;
  productId: string;
  requestedBy: string;
  mode: ImageGenerationMode;
  stylePreset: ImageStylePreset;
  status: ImageGenerationJobStatus;
  provider: string;
  model: string;
  candidateCount: number;
  attemptCount: number;
  referenceMediaId?: string;
  candidateMediaIds: string[];
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductMediaView {
  productId: string;
  brandMode: ProductBrandMode;
  resolvedBrandMode: Exclude<ProductBrandMode, "auto">;
  featuredMedia?: ProductMediaView;
  approvedGallery: ProductMediaView[];
  reviewCandidates: ProductMediaView[];
  generationJobs: ImageGenerationJobView[];
}

export interface CreateProductDraftRequest {
  name: string;
  slug: string;
  categoryId: string;
  shortDescription?: string;
  description?: string;
  tags?: string[];
}

export interface CreateGenerationRequest {
  mode: ImageGenerationMode;
  stylePreset: ImageStylePreset;
  backgroundIntent: ImageBackgroundIntent;
  candidateCount: number;
  referenceMediaId?: string;
  operatorNote?: string;
}

export interface SetFeaturedMediaRequest {
  mediaId: string | null;
}

export interface ReorderGalleryRequest {
  orderedMediaIds: string[];
}

export interface SetProductBrandModeRequest {
  brandMode: ProductBrandMode;
}
