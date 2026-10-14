import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function loadImporter(): null | {
  planLegacyProductMediaImport: (
    products: Array<{ id: string; image: string }>,
    options: { legacyPublicRoot: string; reviewPolicy?: "draft" | "approve" },
  ) => Array<{
    productId: string;
    sourcePath: string;
    source: string;
    status: string;
    visibility: string;
  }>;
} {
  try {
    return require("../scripts/import-legacy-product-media");
  } catch (error: any) {
    if (error?.code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
}

async function readRepoFile(path: string): Promise<string> {
  try {
    return await readFile(resolve(__dirname, "../../../..", path), "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

test("legacy media import plans only owned local product images as unapproved legacy_import rows by default", () => {
  const importer = loadImporter();
  assert.ok(importer, "legacy importer module must exist");
  const planned = importer.planLegacyProductMediaImport([
    { id: "local-product", image: "/images/products/banana.png" },
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
  const importer = loadImporter();
  assert.ok(importer, "legacy importer module must exist");
  const [planned] = importer.planLegacyProductMediaImport(
    [{ id: "local-product", image: "/images/products/banana.png" }],
    { legacyPublicRoot: "/srv/variety/current/public", reviewPolicy: "approve" },
  );
  assert.equal(planned.status, "approved");
  assert.equal(planned.visibility, "public");
});

test("UAT deployment templates isolate public product media and run the worker as lightworld", async () => {
  const [nginx, systemd, runbook] = await Promise.all([
    readRepoFile("deploy/nginx/varietygroceries-product-media.conf"),
    readRepoFile("deploy/systemd/varietygroceries-media-worker.service"),
    readRepoFile("docs/PRODUCT_MEDIA_RUNBOOK.md"),
  ]);

  assert.match(nginx, /alias \/home\/lightworld\/data\/varietygroceries\/product-media\/public\//);
  assert.doesNotMatch(nginx, /product-media\/private/);
  assert.match(nginx, /location \/media\/products\//);
  assert.match(systemd, /^User=lightworld$/m);
  assert.match(systemd, /^Restart=on-failure$/m);
  assert.match(systemd, /npm run worker:media/);
  assert.match(runbook, /fake provider/i);
  assert.match(runbook, /OpenAI/i);
  assert.match(runbook, /S3/i);
  assert.match(runbook, /rollback/i);
  assert.match(runbook, /orphan/i);
});
