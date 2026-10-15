import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Database } from "../src/database/database";
import type { ProductMediaStorage } from "../src/product-media/product-media.storage";
import {
  importLegacyProductMediaItem,
  parseLegacyProductMediaImportArgs,
  planLegacyProductMediaImport,
  runLegacyProductMediaImport,
} from "../scripts/import-legacy-product-media";

async function readRepoFile(path: string): Promise<string> {
  try {
    return await readFile(resolve(__dirname, "../../../..", path), "utf8");
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    )
      return "";
    throw error;
  }
}

test("legacy media import plans only owned local raster product images as unapproved legacy_import rows by default", () => {
  const planned = planLegacyProductMediaImport([
    { id: "local-product", image: "/images/products/banana.png" },
    { id: "legacy-sketch", image: "/products/banana.svg" },
    { id: "unsupported-gif", image: "/products/banana.gif" },
    { id: "external-product", image: "https://images.example.test/banana.png" },
    { id: "protocol-relative", image: "//images.example.test/banana.png" },
    { id: "traversal", image: "/../secret.png" },
    { id: "empty", image: "" },
  ], { legacyPublicRoot: "/srv/variety/current/public" });

  assert.deepEqual(planned, [{
    productId: "local-product",
    sourcePath: "/srv/variety/current/public/images/products/banana.png",
    source: "legacy_import",
    status: "draft",
    visibility: "private",
  }]);
});

test("legacy media import requires an explicit approve review policy before planning public approved media", () => {
  const [planned] = planLegacyProductMediaImport(
    [{ id: "local-product", image: "/images/products/banana.png" }],
    { legacyPublicRoot: "/srv/variety/current/public", reviewPolicy: "approve" },
  );
  assert.equal(planned.status, "approved");
  assert.equal(planned.visibility, "public");
});

test("legacy media import CLI accepts only --dry-run and rejects unknown flags", () => {
  assert.deepEqual(parseLegacyProductMediaImportArgs([]), { dryRun: false });
  assert.deepEqual(parseLegacyProductMediaImportArgs(["--dry-run"]), { dryRun: true });
  assert.throws(
    () => parseLegacyProductMediaImportArgs(["--force"]),
    /Unknown legacy product media import argument: --force/,
  );
});

test("legacy media import dry-run plans catalogue changes without storage or database writes", async () => {
  let mutationAttempted = false;
  const db = {
    product: {
      async findMany() {
        return [
          { id: "local-product", name: "Bananas", image: "/images/products/banana.png" },
          { id: "external-product", name: "External", image: "https://images.example.test/x.png" },
        ];
      },
    },
    productMedia: {
      async findFirst() {
        mutationAttempted = true;
        throw new Error("dry-run must not inspect or mutate product media rows");
      },
    },
    async $transaction() {
      mutationAttempted = true;
      throw new Error("dry-run must not open a write transaction");
    },
  } as unknown as Database;

  const summary = await runLegacyProductMediaImport({
    db,
    legacyPublicRoot: "/srv/variety/current/public",
    reviewPolicy: "draft",
    actorId: "legacy-media-import-test",
    dryRun: true,
  });

  assert.equal(mutationAttempted, false);
  assert.deepEqual(summary, {
    dryRun: true,
    discovered: 2,
    planned: 1,
    imported: 0,
    existing: 0,
    missing: 0,
    skippedExternalOrUnsafe: 1,
    reviewPolicy: "draft",
  });
});

test("legacy media import cleans an unreferenced object when a duplicate wins after storage", async () => {
  const deleted: string[] = [];
  const sha256 = "a".repeat(64);
  const storage: ProductMediaStorage = {
    async put(input) {
      return {
        storageKey: input.key,
        byteSize: input.bytes.length,
        publicUrl: `https://portal.varietygroceries.com/media/products/${input.key.replace(/^public\//, "")}`,
      };
    },
    async read() {
      throw new Error("not used");
    },
    async delete(storageKey) {
      deleted.push(storageKey);
    },
    async exists() {
      return true;
    },
    publicUrl(storageKey) {
      return `https://portal.varietygroceries.com/media/products/${storageKey.replace(/^public\//, "")}`;
    },
  };

  const db = {
    productMedia: {
      async findFirst() {
        return null;
      },
      async count() {
        return 0;
      },
    },
    async $transaction(run: (tx: unknown) => Promise<unknown>) {
      return run({
        productMedia: {
          async findFirst() {
            return { id: "existing-private-row" };
          },
          async create() {
            throw new Error("duplicate must prevent create");
          },
        },
        auditEvent: {
          async create() {
            throw new Error("duplicate must prevent audit create");
          },
        },
      });
    },
  } as unknown as Database;

  const result = await importLegacyProductMediaItem({
    db,
    storage,
    product: {
      id: "product-race",
      name: "Race Product",
      image: "/images/products/race.png",
    },
    plan: {
      productId: "product-race",
      sourcePath: "/srv/variety/current/public/images/products/race.png",
      source: "legacy_import",
      status: "approved",
      visibility: "public",
    },
    actorId: "legacy-media-import-test",
    readSource: async () => Buffer.from("fixture"),
    normalize: async () => ({
      bytes: Buffer.from("normalized-webp"),
      mimeType: "image/webp",
      width: 100,
      height: 100,
      byteSize: Buffer.byteLength("normalized-webp"),
      sha256,
    }),
  });

  assert.equal(result, "existing");
  assert.deepEqual(deleted, [`public/product-race/${sha256.slice(0, 2)}/${sha256}.webp`]);
});

test("UAT deployment templates isolate public product media and run the worker as lightworld", async () => {
  const [nginx, systemd, runbook] = await Promise.all([
    readRepoFile("deploy/nginx/varietygroceries-product-media.conf"),
    readRepoFile("deploy/systemd/varietygroceries-media-worker.service"),
    readRepoFile("docs/PRODUCT_MEDIA_RUNBOOK.md"),
  ]);

  assert.match(nginx, /alias \/home\/lightworld\/data\/varietygroceries\/product-media\/public\//);
  assert.doesNotMatch(nginx, /product-media\/private/);
  assert.match(nginx, /location \^~ \/media\/products\//);
  assert.match(systemd, /^User=lightworld$/m);
  assert.match(systemd, /^Restart=on-failure$/m);
  assert.match(systemd, /ExecStart=\/home\/lightworld\/runtime\/node24\/bin\/node dist\/src\/media-worker\.js/);
  assert.match(runbook, /fake provider/i);
  assert.match(runbook, /OpenAI/i);
  assert.match(runbook, /S3/i);
  assert.match(runbook, /rollback/i);
  assert.match(runbook, /orphan/i);
});
