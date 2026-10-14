import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  GeneratedImageCandidate,
  ImageEditRequest,
  ImageGenerationProvider,
  ImageGenerationRequest,
} from "./image-generation.provider";

function seedFor(request: ImageGenerationRequest, index: number, reference?: Buffer) {
  const hash = createHash("sha256");
  hash.update(request.prompt);
  hash.update("\0");
  hash.update(request.model);
  hash.update("\0");
  hash.update(String(request.candidateCount));
  hash.update("\0");
  hash.update(String(index));
  if (reference) hash.update(reference);
  return hash.digest();
}

async function candidate(seed: Buffer): Promise<GeneratedImageCandidate> {
  const r = 40 + (seed[0] % 176);
  const g = 40 + (seed[1] % 176);
  const b = 40 + (seed[2] % 176);
  const accentR = 40 + (seed[3] % 176);
  const accentG = 40 + (seed[4] % 176);
  const accentB = 40 + (seed[5] % 176);
  const svg = Buffer.from(
    `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="512" height="512" fill="rgb(${r},${g},${b})"/>` +
      `<circle cx="256" cy="238" r="150" fill="rgb(${accentR},${accentG},${accentB})" opacity="0.64"/>` +
      `<circle cx="220" cy="198" r="78" fill="white" opacity="0.18"/>` +
      `</svg>`,
  );
  return {
    bytes: await sharp(svg).png().toBuffer(),
    mimeType: "image/png",
    providerRequestId: `fake_${seed.subarray(0, 8).toString("hex")}`,
  };
}

export class FakeImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "fake";

  async generate(request: ImageGenerationRequest): Promise<GeneratedImageCandidate[]> {
    return Promise.all(
      Array.from({ length: request.candidateCount }, (_, index) => candidate(seedFor(request, index))),
    );
  }

  async edit(request: ImageEditRequest): Promise<GeneratedImageCandidate[]> {
    return Promise.all(
      Array.from(
        { length: request.candidateCount },
        (_, index) => candidate(seedFor(request, index, request.referenceImage)),
      ),
    );
  }
}
