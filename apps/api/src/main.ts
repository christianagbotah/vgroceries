import { createApplication } from "./bootstrap";
import { readConfig } from "./config";
async function main() {
  const config = readConfig();
  const app = await createApplication(config);
  await app.listen(config.port, config.host);
  console.log(`Variety API listening on ${config.host}:${config.port}`);
}
main().catch(() => {
  console.error(
    "API startup failed. Check configuration and database availability.",
  );
  process.exitCode = 1;
});
