import { readConfig, type ApiConfig } from "./config";
import { Database } from "./database/database";
import { FilesystemProductMediaStorage } from "./product-media/filesystem-product-media.storage";
import { GenerationWorkerService } from "./product-media/generation-worker.service";
import { createImageGenerationProvider } from "./product-media/image-generation.registry";
import type { ProductMediaStorage } from "./product-media/product-media.storage";
import { S3ProductMediaStorage } from "./product-media/s3-product-media.storage";

function storageFor(config: ApiConfig): ProductMediaStorage {
  if (!config.productMedia)
    throw new Error("Product media storage must be configured before the media worker can start.");
  if (config.productMedia.kind === "filesystem")
    return new FilesystemProductMediaStorage(
      config.productMedia.root,
      config.productMedia.publicBaseUrl,
    );
  return new S3ProductMediaStorage(config.productMedia);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function runMediaWorker(config: ApiConfig = readConfig()): Promise<void> {
  if (!config.imageGeneration)
    throw new Error("AI image generation must be configured before the media worker can start.");
  const provider = createImageGenerationProvider(config.imageGeneration);
  if (!provider) throw new Error("AI image generation provider is unavailable.");
  const storage = storageFor(config);
  const db = new Database(config);
  await db.$connect();
  const worker = new GenerationWorkerService(db, storage, provider);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  console.log(JSON.stringify({
    event: "media.worker.started",
    provider: provider.id,
    model: config.imageGeneration.model,
  }));

  try {
    while (!stopping) {
      try {
        const job = await worker.claimNextJob();
        if (!job) {
          await delay(config.imageGeneration.workerPollIntervalMs);
          continue;
        }
        await worker.processJob(job.id);
      } catch (error) {
        console.error(JSON.stringify({
          event: "media.worker.iteration_failed",
          errorType: error instanceof Error ? error.name : "unknown",
        }));
        if (!stopping) await delay(config.imageGeneration.workerPollIntervalMs);
      }
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await db.$disconnect();
    console.log(JSON.stringify({ event: "media.worker.stopped" }));
  }
}

if (require.main === module) {
  runMediaWorker().catch((error) => {
    console.error(JSON.stringify({
      event: "media.worker.fatal",
      errorType: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "Media worker failed.",
    }));
    process.exitCode = 1;
  });
}
