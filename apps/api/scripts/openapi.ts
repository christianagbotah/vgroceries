import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApplication } from "../src/bootstrap";
import { foundationOpenApi } from "../src/http/openapi";
async function main() {
  const app = await createApplication();
  try {
    const doc = foundationOpenApi(app);
    const path = resolve(process.cwd(), "../../docs/openapi-foundation.json");
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    console.log(`Foundation OpenAPI: ${Object.keys(doc.paths).length} paths`);
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("OpenAPI generation failed.");
  process.exitCode = 1;
});
