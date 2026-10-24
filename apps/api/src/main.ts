import { createApplication } from "./bootstrap";
import { readConfig } from "./config";
import { createConfiguredProviderAdapters } from "./payments/providers/factory";

async function main() {
  const config = readConfig();
  const configured = createConfiguredProviderAdapters(config);
  const app = await createApplication(
    config,
    configured.paymentAdapters,
    configured.refundAdapters,
  );
  await app.listen(config.port, config.host);
  console.log(`Variety API listening on ${config.host}:${config.port}`);
}
main().catch(() => {
  console.error(
    "API startup failed. Check configuration and database availability.",
  );
  process.exitCode = 1;
});
