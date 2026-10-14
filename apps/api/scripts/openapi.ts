import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApplication } from "../src/bootstrap";
import { productionOpenApi } from "../src/http/production-openapi";
async function main() {
  const app = await createApplication();
  try {
    const doc = productionOpenApi(app);
    const path = resolve(process.cwd(), "../../docs/openapi-foundation.json");
    writeFileSync(path, JSON.stringify(doc) + "\n");
    console.log(`Production OpenAPI: ${Object.keys(doc.paths).length} paths`);
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("OpenAPI generation failed.");
  process.exitCode = 1;
});
