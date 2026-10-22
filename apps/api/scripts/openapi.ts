import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createApplication } from "../src/bootstrap";
import { productionOpenApi } from "../src/http/production-openapi";

async function main() {
  const app = await createApplication();
  try {
    const doc = productionOpenApi(app);
    const path = resolve(process.cwd(), "../../docs/openapi-foundation.json");
    writeFileSync(path, JSON.stringify(doc) + "\n");
    console.log(`Production OpenAPI: ${Object.keys(doc.paths).length} paths`);

    // Temporary branch-only bootstrap: let the trusted PR runner commit the exact
    // deterministic generator output once. This block is removed immediately
    // after the generated artifact lands; it never runs in production.
    const branch = process.env.GITHUB_HEAD_REF;
    if (process.env.GITHUB_ACTIONS === "true" && branch) {
      const repoRoot = resolve(process.cwd(), "../..");
      const changed = spawnSync("git", ["diff", "--quiet", "--", "docs/openapi-foundation.json"], { cwd: repoRoot });
      if (changed.status === 1) {
        const commands = [
          ["config", "user.name", "github-actions[bot]"],
          ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
          ["add", "docs/openapi-foundation.json"],
          ["commit", "-m", "docs(api): sync generated production OpenAPI"],
          ["push", "origin", `HEAD:${branch}`],
        ];
        for (const args of commands) {
          const result = spawnSync("git", args, { cwd: repoRoot, stdio: "inherit" });
          if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
        }
      } else if (changed.status !== 0) {
        throw new Error("Unable to inspect generated OpenAPI diff");
      }
    }
  } finally {
    await app.close();
  }
}

main().catch(() => {
  console.error("OpenAPI generation failed.");
  process.exitCode = 1;
});
